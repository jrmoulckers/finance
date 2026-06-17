// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback } from 'react';

import { createEmptyAccessContact } from '../../lib/estate/accessInfo';
import type { AccessContact, EstateAccessInfo } from '../../lib/estate/types';

export interface TrustedContactsProps {
  readonly accessInfo: EstateAccessInfo;
  readonly onChange: (next: EstateAccessInfo) => void;
}

function updateContactList(
  contacts: readonly AccessContact[],
  contactId: string,
  updater: (contact: AccessContact) => AccessContact,
): AccessContact[] {
  return contacts.map((contact) => (contact.id === contactId ? updater(contact) : contact));
}

export const TrustedContacts: React.FC<TrustedContactsProps> = ({ accessInfo, onChange }) => {
  const updateAccessInfo = useCallback(
    (updates: Partial<EstateAccessInfo>) => {
      onChange({
        ...accessInfo,
        ...updates,
      });
    },
    [accessInfo, onChange],
  );

  const handleContactChange = useCallback(
    (contactId: string, field: keyof AccessContact, value: string | boolean) => {
      const nextContacts = updateContactList(accessInfo.trustedContacts, contactId, (contact) => ({
        ...contact,
        [field]: value,
        isPrimary: field === 'isPrimary' && value === true ? true : contact.isPrimary,
      }));

      const normalizedContacts =
        field === 'isPrimary' && value === true
          ? nextContacts.map((contact) => ({ ...contact, isPrimary: contact.id === contactId }))
          : nextContacts;

      updateAccessInfo({ trustedContacts: normalizedContacts });
    },
    [accessInfo.trustedContacts, updateAccessInfo],
  );

  const addContact = useCallback(() => {
    updateAccessInfo({
      trustedContacts: [...accessInfo.trustedContacts, createEmptyAccessContact()],
    });
  }, [accessInfo.trustedContacts, updateAccessInfo]);

  const removeContact = useCallback(
    (contactId: string) => {
      updateAccessInfo({
        trustedContacts: accessInfo.trustedContacts.filter((contact) => contact.id !== contactId),
      });
    },
    [accessInfo.trustedContacts, updateAccessInfo],
  );

  return (
    <section className="estate-panel estate-trusted-contacts" aria-label="Trusted contacts">
      <div className="estate-panel__header">
        <div>
          <h2 className="estate-panel__title">Trusted contacts & emergency access</h2>
          <p className="estate-panel__description">
            Keep the people, instructions, and document locations beneficiaries will need first.
          </p>
        </div>
        <button type="button" className="estate-button" onClick={addContact}>
          Add trusted contact
        </button>
      </div>

      <div className="estate-form-grid estate-form-grid--two-columns">
        <label className="estate-field">
          <span className="estate-field__label">First instructions</span>
          <textarea
            className="estate-field__control estate-field__control--textarea"
            value={accessInfo.instructions}
            onChange={(event) => updateAccessInfo({ instructions: event.target.value })}
            placeholder="Who to call first, where the will is, what bills must be paid immediately…"
            rows={4}
          />
        </label>
        <label className="estate-field">
          <span className="estate-field__label">Master document location</span>
          <input
            className="estate-field__control"
            type="text"
            value={accessInfo.documentLocation}
            onChange={(event) => updateAccessInfo({ documentLocation: event.target.value })}
            placeholder="Fire safe in office closet"
          />
        </label>
        <label className="estate-field">
          <span className="estate-field__label">Safe deposit box / physical key location</span>
          <input
            className="estate-field__control"
            type="text"
            value={accessInfo.safeDepositLocation}
            onChange={(event) => updateAccessInfo({ safeDepositLocation: event.target.value })}
            placeholder="City National box 41, key in desk drawer"
          />
        </label>
        <label className="estate-field">
          <span className="estate-field__label">Digital vault / password manager note</span>
          <input
            className="estate-field__control"
            type="text"
            value={accessInfo.digitalVaultLocation}
            onChange={(event) => updateAccessInfo({ digitalVaultLocation: event.target.value })}
            placeholder="1Password secure note: Estate Access"
          />
        </label>
      </div>

      <div className="estate-trusted-contacts__list" role="list">
        {accessInfo.trustedContacts.length === 0 ? (
          <div className="estate-empty-state" role="status" aria-live="polite">
            No trusted contacts yet. Add at least one person beneficiaries can call.
          </div>
        ) : null}

        {accessInfo.trustedContacts.map((contact, index) => (
          <article key={contact.id} className="estate-card estate-card--contact" role="listitem">
            <div className="estate-card__header">
              <div>
                <p className="estate-card__eyebrow">Trusted contact {index + 1}</p>
                <h3 className="estate-card__title">{contact.name || 'New trusted contact'}</h3>
              </div>
              <button
                type="button"
                className="estate-button estate-button--ghost"
                onClick={() => removeContact(contact.id)}
              >
                Remove
              </button>
            </div>

            <div className="estate-form-grid estate-form-grid--two-columns">
              <label className="estate-field">
                <span className="estate-field__label">Name</span>
                <input
                  className="estate-field__control"
                  type="text"
                  value={contact.name}
                  onChange={(event) => handleContactChange(contact.id, 'name', event.target.value)}
                  placeholder="Jamie Doe"
                />
              </label>
              <label className="estate-field">
                <span className="estate-field__label">Relationship</span>
                <input
                  className="estate-field__control"
                  type="text"
                  value={contact.relationship}
                  onChange={(event) =>
                    handleContactChange(contact.id, 'relationship', event.target.value)
                  }
                  placeholder="Sibling, spouse, executor"
                />
              </label>
              <label className="estate-field">
                <span className="estate-field__label">Phone</span>
                <input
                  className="estate-field__control"
                  type="tel"
                  value={contact.phone}
                  onChange={(event) => handleContactChange(contact.id, 'phone', event.target.value)}
                  placeholder="(555) 555-1212"
                />
              </label>
              <label className="estate-field">
                <span className="estate-field__label">Email</span>
                <input
                  className="estate-field__control"
                  type="email"
                  value={contact.email}
                  onChange={(event) => handleContactChange(contact.id, 'email', event.target.value)}
                  placeholder="jamie@example.com"
                />
              </label>
              <label className="estate-field estate-field--full-width">
                <span className="estate-field__label">What this person knows about</span>
                <input
                  className="estate-field__control"
                  type="text"
                  value={contact.knowsAbout}
                  onChange={(event) =>
                    handleContactChange(contact.id, 'knowsAbout', event.target.value)
                  }
                  placeholder="Will location, attorney, insurance claims"
                />
              </label>
              <label className="estate-field estate-field--full-width">
                <span className="estate-field__label">Notes</span>
                <textarea
                  className="estate-field__control estate-field__control--textarea"
                  value={contact.notes}
                  onChange={(event) => handleContactChange(contact.id, 'notes', event.target.value)}
                  placeholder="Best time to call, spouse contact info, travel constraints…"
                  rows={3}
                />
              </label>
            </div>

            <label className="estate-checkbox">
              <input
                type="checkbox"
                checked={contact.isPrimary}
                onChange={(event) =>
                  handleContactChange(contact.id, 'isPrimary', event.target.checked)
                }
              />
              <span>Primary emergency contact</span>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
};

export default TrustedContacts;
