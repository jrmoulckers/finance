// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.schedulec

import com.finance.models.types.Cents
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** IRS Schedule C expense categories used by shared gig/business quick-add flows. */
@Serializable
enum class ScheduleCExpenseCategory {
    @SerialName("advertising")
    ADVERTISING,

    @SerialName("car_and_truck")
    CAR_AND_TRUCK,

    @SerialName("commissions_and_fees")
    COMMISSIONS_AND_FEES,

    @SerialName("contract_labor")
    CONTRACT_LABOR,

    @SerialName("depletion")
    DEPLETION,

    @SerialName("depreciation_and_section_179")
    DEPRECIATION_AND_SECTION_179,

    @SerialName("employee_benefit_programs")
    EMPLOYEE_BENEFIT_PROGRAMS,

    @SerialName("insurance")
    INSURANCE,

    @SerialName("interest_mortgage")
    INTEREST_MORTGAGE,

    @SerialName("interest_other")
    INTEREST_OTHER,

    @SerialName("legal_and_professional")
    LEGAL_AND_PROFESSIONAL,

    @SerialName("office_expense")
    OFFICE_EXPENSE,

    @SerialName("pension_and_profit_sharing")
    PENSION_AND_PROFIT_SHARING,

    @SerialName("rent_or_lease_vehicles_equipment")
    RENT_OR_LEASE_VEHICLES_EQUIPMENT,

    @SerialName("rent_or_lease_other_business_property")
    RENT_OR_LEASE_OTHER_BUSINESS_PROPERTY,

    @SerialName("repairs_and_maintenance")
    REPAIRS_AND_MAINTENANCE,

    @SerialName("supplies")
    SUPPLIES,

    @SerialName("taxes_and_licenses")
    TAXES_AND_LICENSES,

    @SerialName("travel")
    TRAVEL,

    @SerialName("meals")
    MEALS,

    @SerialName("utilities")
    UTILITIES,

    @SerialName("wages")
    WAGES,

    @SerialName("other_expenses")
    OTHER_EXPENSES,

    @SerialName("home_office")
    HOME_OFFICE,
}

@Serializable
data class ScheduleCDeductionPreset(
    val id: String,
    val category: ScheduleCExpenseCategory,
    val displayName: String,
    val irsLine: String,
    val description: String,
    val defaultBusinessUsePercent: Int,
    val deductibleByDefault: Boolean = true,
    val examples: List<String> = emptyList(),
    val notes: String? = null,
)

@Serializable
data class ScheduleCDraftRequest(
    val amountCents: Cents,
    val businessUsePercentOverride: Int? = null,
    val deductibleOverride: Boolean? = null,
    val memo: String? = null,
)

@Serializable
data class ScheduleCTransactionDraft(
    val presetId: String,
    val category: ScheduleCExpenseCategory,
    val categoryDisplayName: String,
    val irsLine: String,
    val amountCents: Cents,
    val deductible: Boolean,
    val businessUsePercent: Int,
    val deductibleAmountCents: Cents,
    val memo: String? = null,
)

@Serializable
data class ScheduleCValidationIssue(
    val field: String,
    val message: String,
)

object ScheduleCDeductionPresetTaxonomy {
    val presets: List<ScheduleCDeductionPreset> = listOf(
        preset(
            id = "schedule-c-advertising",
            category = ScheduleCExpenseCategory.ADVERTISING,
            displayName = "Advertising",
            irsLine = "Line 8",
            description = "Marketing, promoted listings, business cards, websites, and other customer acquisition costs.",
            examples = listOf("Sponsored posts", "Marketplace ads", "Flyers"),
        ),
        preset(
            id = "schedule-c-car-and-truck",
            category = ScheduleCExpenseCategory.CAR_AND_TRUCK,
            displayName = "Car and truck expenses",
            irsLine = "Line 9",
            description = "Vehicle costs for business driving when not using a mileage-only workflow.",
            defaultBusinessUsePercent = 90,
            examples = listOf("Fuel", "Tolls", "Parking", "Vehicle maintenance"),
            notes = "Default assumes a mostly business-use gig vehicle; users can override per transaction.",
        ),
        preset(
            id = "schedule-c-commissions-and-fees",
            category = ScheduleCExpenseCategory.COMMISSIONS_AND_FEES,
            displayName = "Commissions and fees",
            irsLine = "Line 10",
            description = "Platform, marketplace, processing, referral, and payment fees paid to earn business income.",
            examples = listOf("Payment processor fees", "Marketplace commissions", "Referral fees"),
        ),
        preset(
            id = "schedule-c-contract-labor",
            category = ScheduleCExpenseCategory.CONTRACT_LABOR,
            displayName = "Contract labor",
            irsLine = "Line 11",
            description = "Payments to independent contractors and freelancers for business services.",
            examples = listOf("Bookkeeper", "Designer", "Virtual assistant"),
        ),
        preset(
            id = "schedule-c-depletion",
            category = ScheduleCExpenseCategory.DEPLETION,
            displayName = "Depletion",
            irsLine = "Line 12",
            description = "Natural resource depletion deductions for eligible businesses.",
            examples = listOf("Resource depletion allowance"),
        ),
        preset(
            id = "schedule-c-depreciation-section-179",
            category = ScheduleCExpenseCategory.DEPRECIATION_AND_SECTION_179,
            displayName = "Depreciation and section 179",
            irsLine = "Line 13",
            description = "Depreciation, amortization, and section 179 deductions for business assets.",
            examples = listOf("Laptop depreciation", "Equipment depreciation", "Section 179 asset"),
        ),
        preset(
            id = "schedule-c-employee-benefits",
            category = ScheduleCExpenseCategory.EMPLOYEE_BENEFIT_PROGRAMS,
            displayName = "Employee benefit programs",
            irsLine = "Line 14",
            description = "Employee benefits other than pension and profit-sharing plans.",
            examples = listOf("Employee health benefits", "Employee assistance program"),
        ),
        preset(
            id = "schedule-c-insurance",
            category = ScheduleCExpenseCategory.INSURANCE,
            displayName = "Insurance",
            irsLine = "Line 15",
            description = "Business insurance premiums other than health insurance.",
            examples = listOf("General liability", "E&O insurance", "Business property insurance"),
        ),
        preset(
            id = "schedule-c-interest-mortgage",
            category = ScheduleCExpenseCategory.INTEREST_MORTGAGE,
            displayName = "Mortgage interest",
            irsLine = "Line 16a",
            description = "Mortgage interest paid to banks or other financial institutions for business property.",
            examples = listOf("Business property mortgage interest"),
        ),
        preset(
            id = "schedule-c-interest-other",
            category = ScheduleCExpenseCategory.INTEREST_OTHER,
            displayName = "Other interest",
            irsLine = "Line 16b",
            description = "Business loan, credit card, and other interest not reported as mortgage interest.",
            examples = listOf("Business credit card interest", "Equipment loan interest"),
        ),
        preset(
            id = "schedule-c-legal-professional",
            category = ScheduleCExpenseCategory.LEGAL_AND_PROFESSIONAL,
            displayName = "Legal and professional services",
            irsLine = "Line 17",
            description = "Professional services used to operate the business.",
            examples = listOf("Tax preparation", "Legal advice", "Accounting"),
        ),
        preset(
            id = "schedule-c-office-expense",
            category = ScheduleCExpenseCategory.OFFICE_EXPENSE,
            displayName = "Office expense",
            irsLine = "Line 18",
            description = "Office supplies, software, postage, and small equipment used in the business.",
            examples = listOf("Printer ink", "Postage", "Productivity software"),
        ),
        preset(
            id = "schedule-c-pension-profit-sharing",
            category = ScheduleCExpenseCategory.PENSION_AND_PROFIT_SHARING,
            displayName = "Pension and profit-sharing plans",
            irsLine = "Line 19",
            description = "Business pension and profit-sharing plan contributions for employees.",
            examples = listOf("Employee retirement plan contribution"),
        ),
        preset(
            id = "schedule-c-rent-lease-vehicles-equipment",
            category = ScheduleCExpenseCategory.RENT_OR_LEASE_VEHICLES_EQUIPMENT,
            displayName = "Rent or lease vehicles, machinery, and equipment",
            irsLine = "Line 20a",
            description = "Rent or lease payments for business vehicles, machinery, and equipment.",
            examples = listOf("Equipment rental", "Business vehicle lease", "Camera rental"),
        ),
        preset(
            id = "schedule-c-rent-lease-other-property",
            category = ScheduleCExpenseCategory.RENT_OR_LEASE_OTHER_BUSINESS_PROPERTY,
            displayName = "Rent or lease other business property",
            irsLine = "Line 20b",
            description = "Rent or lease payments for offices, storage, booths, and other business property.",
            examples = listOf("Office rent", "Storage unit", "Market booth rent"),
        ),
        preset(
            id = "schedule-c-repairs-maintenance",
            category = ScheduleCExpenseCategory.REPAIRS_AND_MAINTENANCE,
            displayName = "Repairs and maintenance",
            irsLine = "Line 21",
            description = "Repairs and maintenance needed to keep business property or equipment working.",
            examples = listOf("Equipment repair", "Device repair", "Routine maintenance"),
        ),
        preset(
            id = "schedule-c-supplies",
            category = ScheduleCExpenseCategory.SUPPLIES,
            displayName = "Supplies",
            irsLine = "Line 22",
            description = "Consumable supplies used directly in business operations.",
            examples = listOf("Packaging", "Cleaning supplies", "Delivery bags"),
        ),
        preset(
            id = "schedule-c-taxes-licenses",
            category = ScheduleCExpenseCategory.TAXES_AND_LICENSES,
            displayName = "Taxes and licenses",
            irsLine = "Line 23",
            description = "Business licenses, permits, and deductible business taxes.",
            examples = listOf("Business license", "Permit fee", "Local business tax"),
        ),
        preset(
            id = "schedule-c-travel",
            category = ScheduleCExpenseCategory.TRAVEL,
            displayName = "Travel",
            irsLine = "Line 24a",
            description = "Business travel away from home, excluding meals.",
            examples = listOf("Hotel", "Airfare", "Rental car"),
        ),
        preset(
            id = "schedule-c-meals",
            category = ScheduleCExpenseCategory.MEALS,
            displayName = "Deductible meals",
            irsLine = "Line 24b",
            description = "Business meals subject to the default meals limitation.",
            defaultBusinessUsePercent = 50,
            examples = listOf("Client meal", "Travel meal", "Business meeting coffee"),
            notes = "Default reflects the common 50% meals limitation; users can override when rules differ.",
        ),
        preset(
            id = "schedule-c-utilities",
            category = ScheduleCExpenseCategory.UTILITIES,
            displayName = "Utilities",
            irsLine = "Line 25",
            description = "Utilities for a separate business location and business-only services.",
            examples = listOf("Business phone", "Internet service", "Office utilities"),
        ),
        preset(
            id = "schedule-c-wages",
            category = ScheduleCExpenseCategory.WAGES,
            displayName = "Wages",
            irsLine = "Line 26",
            description = "Employee wages paid by the business.",
            examples = listOf("Payroll", "Employee wages"),
        ),
        preset(
            id = "schedule-c-other-expenses",
            category = ScheduleCExpenseCategory.OTHER_EXPENSES,
            displayName = "Other expenses",
            irsLine = "Line 27a",
            description = "Ordinary and necessary business expenses that do not fit another Schedule C category.",
            examples = listOf("Bank fees", "Dues", "Education", "Subscriptions"),
        ),
        preset(
            id = "schedule-c-home-office",
            category = ScheduleCExpenseCategory.HOME_OFFICE,
            displayName = "Business use of home",
            irsLine = "Line 30",
            description = "Home office costs allocated to the exclusive, regular business-use area of the home.",
            defaultBusinessUsePercent = 25,
            examples = listOf("Home internet allocation", "Home utilities allocation", "Home office rent allocation"),
            notes = "Default is intentionally conservative for mixed-use homes and should be overridden with the user's calculated allocation.",
        ),
    )

    private val presetsById: Map<String, ScheduleCDeductionPreset> = presets.associateBy { it.id }

    fun findPreset(id: String): ScheduleCDeductionPreset? = presetsById[id]

    fun presetsForCategory(category: ScheduleCExpenseCategory): List<ScheduleCDeductionPreset> =
        presets.filter { it.category == category }

    fun validatePreset(preset: ScheduleCDeductionPreset): List<ScheduleCValidationIssue> = buildList {
        if (preset.id.isBlank()) add(issue("id", "Preset id is required."))
        if (preset.displayName.isBlank()) add(issue("displayName", "Display name is required."))
        if (preset.irsLine.isBlank()) add(issue("irsLine", "IRS line is required."))
        if (preset.description.isBlank()) add(issue("description", "Description is required."))
        if (preset.defaultBusinessUsePercent !in 0..100) {
            add(issue("defaultBusinessUsePercent", "Business-use percent must be in 0..100."))
        }
        if (preset.examples.isEmpty()) add(issue("examples", "At least one example is required."))
        preset.examples.forEachIndexed { index, example ->
            if (example.isBlank()) add(issue("examples[$index]", "Example must not be blank."))
        }
    }

    fun validateDraftRequest(request: ScheduleCDraftRequest): List<ScheduleCValidationIssue> = buildList {
        if (request.amountCents.amount <= 0L) add(issue("amountCents", "Amount must be greater than zero."))
        val override = request.businessUsePercentOverride
        if (override != null && override !in 0..100) {
            add(issue("businessUsePercentOverride", "Business-use percent must be in 0..100."))
        }
    }

    fun validateDraft(draft: ScheduleCTransactionDraft): List<ScheduleCValidationIssue> = buildList {
        if (draft.presetId.isBlank()) add(issue("presetId", "Preset id is required."))
        if (draft.categoryDisplayName.isBlank()) add(issue("categoryDisplayName", "Category display name is required."))
        if (draft.irsLine.isBlank()) add(issue("irsLine", "IRS line is required."))
        if (draft.amountCents.amount <= 0L) add(issue("amountCents", "Amount must be greater than zero."))
        if (draft.businessUsePercent !in 0..100) {
            add(issue("businessUsePercent", "Business-use percent must be in 0..100."))
        }
        if (!draft.deductible && !draft.deductibleAmountCents.isZero()) {
            add(issue("deductibleAmountCents", "Non-deductible drafts must have a zero deductible amount."))
        }
    }

    fun createDraft(presetId: String, request: ScheduleCDraftRequest): ScheduleCTransactionDraft {
        val preset = requireNotNull(findPreset(presetId)) { "Unknown Schedule C preset id: $presetId" }
        val errors = validateDraftRequest(request)
        require(errors.isEmpty()) { errors.joinToString { "${it.field}: ${it.message}" } }

        val businessUsePercent = request.businessUsePercentOverride ?: preset.defaultBusinessUsePercent
        val deductible = request.deductibleOverride ?: preset.deductibleByDefault
        val deductibleAmount = if (deductible) prorate(request.amountCents, businessUsePercent) else Cents.ZERO

        return ScheduleCTransactionDraft(
            presetId = preset.id,
            category = preset.category,
            categoryDisplayName = preset.displayName,
            irsLine = preset.irsLine,
            amountCents = request.amountCents,
            deductible = deductible,
            businessUsePercent = businessUsePercent,
            deductibleAmountCents = deductibleAmount,
            memo = request.memo?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    private fun preset(
        id: String,
        category: ScheduleCExpenseCategory,
        displayName: String,
        irsLine: String,
        description: String,
        defaultBusinessUsePercent: Int = 100,
        examples: List<String>,
        notes: String? = null,
    ) = ScheduleCDeductionPreset(
        id = id,
        category = category,
        displayName = displayName,
        irsLine = irsLine,
        description = description,
        defaultBusinessUsePercent = defaultBusinessUsePercent,
        examples = examples,
        notes = notes,
    )

    private fun issue(field: String, message: String) = ScheduleCValidationIssue(field, message)

    private fun prorate(amountCents: Cents, businessUsePercent: Int): Cents =
        Cents(amountCents.amount * businessUsePercent / 100L)
}
