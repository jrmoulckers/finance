// SPDX-License-Identifier: BUSL-1.1

// PickerOption.swift
// Finance
//
// Lightweight model for populating picker controls (account picker,
// category picker) in transaction creation and similar flows.

import Foundation

/// A generic option for use in `Picker` and selection lists.
struct PickerOption: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
    let icon: String
}
