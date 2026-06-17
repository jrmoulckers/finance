# Onboarding assistive-technology QA checklist

Use this checklist for every onboarding change. Test with keyboard only plus NVDA/Firefox, JAWS/Chrome, and VoiceOver/Safari when available.

## Structure and navigation
- Page exposes one main landmark with the current step label.
- Heading order starts at one h1 and does not skip levels.
- Tab order follows the visual order: comfort settings, path choice, privacy, template, complete.
- Skip/continue/back-equivalent paths do not trap focus or strand the user.

## Labels and instructions
- Text-size slider, reduced motion, simplified mode, high contrast, path buttons, privacy buttons, template controls, lesson choices, and goal fields have clear accessible names.
- Helper text is programmatically associated where it changes how to complete a control.
- Duplicate actions include context, such as which checklist item or lesson they affect.

## Announcements and focus
- Step changes update the `Onboarding progress` polite live region.
- Saving, completion, and validation/error states are announced once without repeating on unrelated state changes.
- Dialogs move focus inside, expose `aria-modal`, and restore or provide a predictable next focus target when closed.
- Validation errors use alert/assertive behavior only when immediate attention is required.

## Visual accessibility
- Visible focus is present on every interactive control.
- Reduced motion removes nonessential animations and does not hide state changes.
- High contrast mode keeps text, borders, focus rings, and disabled states distinguishable.
- Huge text (200%) preserves single-axis reading without clipped controls.

## Screen-reader spot checks
- Comfort step: each preference announces name, state/value, and purpose.
- Setup path step: Local Only and Create Account cards announce headings, descriptions, and button names.
- Privacy step: both choices announce the privacy consequence before activation.
- Template step: life-stage checkboxes, lesson choices, goal fields, preview, save, and glossary dialog are discoverable.
- Complete step: checklist progress, coach marks, restore/dismiss actions, and Dashboard/Budgets/Goals links are announced with context.

Record AT/browser, pass/fail, bugs filed, and any intentional gaps in the PR notes.
