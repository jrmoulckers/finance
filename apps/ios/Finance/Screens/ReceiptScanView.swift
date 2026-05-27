// SPDX-License-Identifier: BUSL-1.1

// ReceiptScanView.swift
// Finance
//
// Receipt scanning screen with camera capture, OCR processing,
// result review, and transaction creation from extracted data.
//
// Uses Apple Vision for on-device OCR — no data leaves the device.
//
// References: #301

import PhotosUI
import SwiftUI
import UIKit

struct ReceiptScanView: View {
    @State private var viewModel: ReceiptScanViewModel
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showCamera = false
    @State private var showConfirmation = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(transactionRepository: TransactionRepository) {
        _viewModel = State(initialValue: ReceiptScanViewModel(
            transactionRepository: transactionRepository
        ))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.scanStatus {
                case .idle:
                    captureView
                case .processing:
                    processingView
                case .completed:
                    resultView
                case .failed(let message):
                    failedView(message)
                case .capturing:
                    captureView
                }
            }
            .navigationTitle(String(localized: "Scan Receipt"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) {
                        dismiss()
                    }
                    .accessibilityLabel(String(localized: "Cancel scanning"))
                }
            }
            .alert(
                String(localized: "Error"),
                isPresented: .init(
                    get: { viewModel.showError },
                    set: { if !$0 { viewModel.dismissError() } }
                )
            ) {
                Button(String(localized: "OK"), role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage ?? "")
            }
            .alert(
                String(localized: "Transaction Saved"),
                isPresented: $showConfirmation
            ) {
                Button(String(localized: "Done")) { dismiss() }
                Button(String(localized: "Scan Another")) { viewModel.resetScan() }
            } message: {
                Text(String(localized: "The transaction has been created from the receipt."))
            }
            .sheet(isPresented: $showCamera) {
                CameraCaptureView { imageData in
                    Task { await viewModel.processImage(imageData) }
                }
            }
        }
    }

    // MARK: - Capture View

    private var captureView: some View {
        VStack(spacing: 32) {
            Spacer()

            Image(systemName: "doc.text.viewfinder")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)

            VStack(spacing: 8) {
                Text(String(localized: "Scan a Receipt"))
                    .font(.title2)
                    .fontWeight(.semibold)

                Text(String(localized: "Take a photo or choose from your library to automatically extract transaction details."))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            VStack(spacing: 16) {
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button {
                        showCamera = true
                    } label: {
                        Label(
                            String(localized: "Take Photo"),
                            systemImage: "camera"
                        )
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityLabel(String(localized: "Take a receipt photo"))
                }

                PhotosPicker(
                    selection: $selectedPhoto,
                    matching: .images
                ) {
                    Label(
                        String(localized: "Choose Photo"),
                        systemImage: "photo.on.rectangle"
                    )
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel(String(localized: "Choose a receipt photo from library"))
                .accessibilityHint(String(localized: "Opens the photo picker"))
            }
            .padding(.horizontal, 40)
            .onChange(of: selectedPhoto) {
                Task { await handlePhotoSelection() }
            }

            Spacer()

            Text(String(localized: "All processing happens on your device. Your receipts are never uploaded."))
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .accessibilityLabel(String(localized: "Privacy notice: all processing happens on your device"))
        }
        .padding()
    }

    // MARK: - Processing View

    private var processingView: some View {
        VStack(spacing: 24) {
            Spacer()

            ProgressView()
                .scaleEffect(1.5)

            Text(String(localized: "Analyzing receipt…"))
                .font(.headline)

            Text(String(localized: "Extracting merchant, amounts, and date"))
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "Processing receipt, please wait"))
    }

    // MARK: - Result View

    private var resultView: some View {
        Form {
            // Confidence Section
            Section {
                HStack {
                    Label(
                        String(localized: "Confidence"),
                        systemImage: "checkmark.seal"
                    )
                    Spacer()
                    Text(viewModel.confidenceText)
                        .fontWeight(.medium)
                        .foregroundStyle(
                            (viewModel.scannedReceipt?.confidence ?? 0) >= 70
                                ? .green : .orange
                        )
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(localized: "OCR confidence: \(viewModel.confidenceText)")
                )
            }

            // Extracted Data Section
            Section {
                TextField(
                    String(localized: "Merchant"),
                    text: $viewModel.merchant
                )
                .accessibilityLabel(String(localized: "Merchant name"))

                TextField(
                    String(localized: "Total Amount"),
                    text: $viewModel.totalAmount
                )
                .keyboardType(.decimalPad)
                .accessibilityLabel(String(localized: "Total amount"))

                DatePicker(
                    String(localized: "Date"),
                    selection: $viewModel.transactionDate,
                    displayedComponents: .date
                )
                .accessibilityLabel(String(localized: "Transaction date"))

                TextField(
                    String(localized: "Category"),
                    text: $viewModel.selectedCategory
                )
                .accessibilityLabel(String(localized: "Category"))
                .accessibilityHint(String(localized: "Auto-suggested from merchant name"))
            } header: {
                Text(String(localized: "Extracted Details"))
                    .accessibilityAddTraits(.isHeader)
            } footer: {
                Text(String(localized: "Review and correct any details before saving."))
            }

            // Line Items
            if let receipt = viewModel.scannedReceipt,
               !receipt.extractedData.lineItems.isEmpty {
                Section {
                    ForEach(receipt.extractedData.lineItems) { item in
                        Toggle(
                            isOn: .init(
                                get: { viewModel.acceptedLineItemIds.contains(item.id) },
                                set: { viewModel.setLineItemAccepted(item, accepted: $0) }
                            )
                        ) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.description)
                                    .font(.subheadline)
                                Text(String(format: "$%.2f", Double(item.amountMinorUnits) / 100.0))
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                if let category = item.suggestedCategory {
                                    Text(category)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .accessibilityLabel(
                            "\(item.description): \(String(format: "$%.2f", Double(item.amountMinorUnits) / 100.0))"
                        )
                    }
                } header: {
                    Text(String(localized: "Line Items"))
                        .accessibilityAddTraits(.isHeader)
                }
            }

            // Notes
            Section {
                TextField(
                    String(localized: "Notes"),
                    text: $viewModel.notes,
                    axis: .vertical
                )
                .lineLimit(3...6)
                .accessibilityLabel(String(localized: "Transaction notes"))
            }

            // Actions
            Section {
                Button {
                    Task {
                        let success = await viewModel.createTransaction()
                        if success { showConfirmation = true }
                    }
                } label: {
                    Label(
                        String(localized: "Save Transaction"),
                        systemImage: "checkmark.circle"
                    )
                    .frame(maxWidth: .infinity)
                }
                .disabled(!viewModel.canCreateTransaction)
                .accessibilityLabel(String(localized: "Save transaction from receipt"))
                .accessibilityHint(
                    viewModel.canCreateTransaction
                        ? String(localized: "Creates a new expense transaction")
                        : String(localized: "Enter merchant and amount to save")
                )

                Button {
                    viewModel.resetScan()
                } label: {
                    Label(
                        String(localized: "Scan Another"),
                        systemImage: "arrow.counterclockwise"
                    )
                    .frame(maxWidth: .infinity)
                }
                .accessibilityLabel(String(localized: "Scan another receipt"))
            }
        }
    }

    // MARK: - Failed View

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundStyle(.orange)
                .accessibilityHidden(true)

            Text(String(localized: "Scan Failed"))
                .font(.title2)
                .fontWeight(.semibold)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button {
                viewModel.resetScan()
            } label: {
                Label(String(localized: "Try Again"), systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 40)
            .accessibilityLabel(String(localized: "Try scanning again"))

            Spacer()
        }
    }

    // MARK: - Photo Handling

    private func handlePhotoSelection() async {
        guard let selectedPhoto else { return }
        do {
            if let data = try await selectedPhoto.loadTransferable(type: Data.self) {
                await viewModel.processImage(data)
            }
        } catch {
            viewModel.errorMessage = String(localized: "Failed to load the selected photo.")
        }
        self.selectedPhoto = nil
    }
}

private struct CameraCaptureView: UIViewControllerRepresentable {
    let onImageData: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        private let parent: CameraCaptureView

        init(parent: CameraCaptureView) {
            self.parent = parent
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage,
               let data = image.jpegData(compressionQuality: 0.92) {
                parent.onImageData(data)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

#Preview("Receipt Scan") {
    ReceiptScanView(transactionRepository: StubTransactionRepository())
}
