// SPDX-License-Identifier: BUSL-1.1
import SwiftUI
struct CategoryFormView: View {
    @Environment(\.dismiss) private var dismiss
    let mode: Mode; let onSave: (_ name: String, _ colorHex: String, _ iconName: String) -> Void
    @State private var name: String; @State private var selectedColorHex: String; @State private var selectedIcon: String; @State private var showingValidationError = false
    enum Mode: Identifiable { case create; case edit(CategoryItem); var id: String { switch self { case .create: "create"; case .edit(let i): i.id } } }
    static let presetColors: [(name: String, hex: String)] = [("Green","#4CAF50"),("Blue","#2196F3"),("Purple","#9C27B0"),("Orange","#FF9800"),("Red","#F44336"),("Pink","#E91E63"),("Cyan","#00BCD4"),("Blue Grey","#607D8B"),("Teal","#009688"),("Indigo","#3F51B5"),("Amber","#FFC107"),("Deep Orange","#FF5722"),("Light Green","#8BC34A"),("Deep Purple","#673AB7"),("Brown","#795548"),("Lime","#CDDC39")]
    static let availableIcons: [(name: String, label: String)] = [("cart","Cart"),("car","Car"),("house","House"),("heart","Heart"),("book","Book"),("fork.knife","Dining"),("film","Film"),("bag","Bag"),("bolt","Bolt"),("airplane","Airplane"),("gift","Gift"),("graduationcap","Education"),("stethoscope","Medical"),("dumbbell","Fitness"),("music.note","Music"),("gamecontroller","Gaming"),("paintbrush","Art"),("wrench.and.screwdriver","Tools"),("fuelpump","Fuel"),("wifi","Internet"),("phone","Phone"),("dollarsign.circle","Money"),("briefcase","Work"),("ellipsis.circle","Other")]
    init(mode: Mode, onSave: @escaping (_ name: String, _ colorHex: String, _ iconName: String) -> Void) {
        self.mode = mode; self.onSave = onSave
        switch mode { case .create: _name = State(initialValue: ""); _selectedColorHex = State(initialValue: Self.presetColors[0].hex); _selectedIcon = State(initialValue: Self.availableIcons[0].name)
        case .edit(let c): _name = State(initialValue: c.name); _selectedColorHex = State(initialValue: c.colorHex); _selectedIcon = State(initialValue: c.iconName) }
    }
    var body: some View {
        NavigationStack {
            Form { nameSection; colorSection; iconSection; previewSection }
                .navigationTitle(navTitle).navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(String(localized: "Cancel")) { dismiss() }.accessibilityLabel(String(localized: "Cancel")).accessibilityHint(String(localized: "Dismisses the category form without saving")) }
                    ToolbarItem(placement: .confirmationAction) { Button(String(localized: "Save")) { save() }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel(String(localized: "Save category")).accessibilityHint(String(localized: "Saves the category and closes the form")) }
                }
                .alert(String(localized: "Validation Error"), isPresented: $showingValidationError) { Button(String(localized: "OK"), role: .cancel) {} } message: { Text(String(localized: "Please enter a category name.")) }
        }
    }
    private var nameSection: some View { Section(String(localized: "Name")) { TextField(String(localized: "Category name"), text: $name).accessibilityLabel(String(localized: "Category name")).accessibilityHint(String(localized: "Enter a name for this category")) } }
    private var colorSection: some View {
        Section(String(localized: "Color")) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12) {
                ForEach(Self.presetColors, id: \.hex) { p in
                    Button { selectedColorHex = p.hex } label: { ZStack { Circle().fill(Color(hex: p.hex) ?? .gray).frame(width: 44, height: 44); if selectedColorHex == p.hex { Image(systemName: "checkmark").font(.system(size: 16, weight: .bold)).foregroundStyle(.white) } } }
                        .accessibilityLabel(p.name).accessibilityValue(selectedColorHex == p.hex ? String(localized: "Selected") : "").accessibilityHint(String(localized: "Selects \(p.name) as the category color")).accessibilityAddTraits(selectedColorHex == p.hex ? .isSelected : [])
                }
            }.padding(.vertical, 8)
        }
    }
    private var iconSection: some View {
        Section(String(localized: "Icon")) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 6), spacing: 12) {
                ForEach(Self.availableIcons, id: \.name) { ic in
                    Button { selectedIcon = ic.name } label: { ZStack { RoundedRectangle(cornerRadius: 8).fill(selectedIcon == ic.name ? (Color(hex: selectedColorHex) ?? .blue) : Color.gray.opacity(0.15)).frame(width: 44, height: 44); Image(systemName: ic.name).font(.system(size: 18)).foregroundStyle(selectedIcon == ic.name ? .white : .primary) } }
                        .accessibilityLabel(ic.label).accessibilityValue(selectedIcon == ic.name ? String(localized: "Selected") : "").accessibilityHint(String(localized: "Selects \(ic.label) as the category icon")).accessibilityAddTraits(selectedIcon == ic.name ? .isSelected : [])
                }
            }.padding(.vertical, 8)
        }
    }
    private var previewSection: some View {
        Section(String(localized: "Preview")) {
            HStack(spacing: 12) { ZStack { Circle().fill(Color(hex: selectedColorHex) ?? .gray).frame(width: 36, height: 36); Image(systemName: selectedIcon).font(.system(size: 16, weight: .medium)).foregroundStyle(.white) }; Text(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(localized: "Category name") : name).font(.body).foregroundStyle(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : .primary) }.padding(.vertical, 4).accessibilityElement(children: .combine).accessibilityLabel(String(localized: "Category preview")).accessibilityValue(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(localized: "No name entered") : name)
        }
    }
    private var navTitle: String { switch mode { case .create: String(localized: "New Category"); case .edit: String(localized: "Edit Category") } }
    private func save() { let t = name.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { showingValidationError = true; return }; onSave(t, selectedColorHex, selectedIcon); dismiss() }
}
#Preview("Create") { CategoryFormView(mode: .create) { _, _, _ in } }