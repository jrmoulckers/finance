// SPDX-License-Identifier: BUSL-1.1

/**
 * TagInput — multi-select input with autocomplete for tag management.
 *
 * Features:
 * - Shows selected tags as colored chips inside the input
 * - Dropdown with existing tags filtered by typed text
 * - "Create new tag" option at bottom if no exact match
 * - Subtag support via `:` separator (e.g., "travel:flights")
 * - Keyboard navigable: arrow keys, Enter to select, Backspace to remove
 * - Accessible: combobox role, aria-expanded, aria-activedescendant
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Tag } from './Tag';

/** Props for the TagInput component. */
export interface TagInputProps {
  /** Currently selected tag names. */
  value: string[];
  /** Callback when selected tags change. */
  onChange: (tags: string[]) => void;
  /** Available tags for autocomplete suggestions. */
  suggestions?: string[];
  /** Placeholder text when no tags are selected and input is empty. */
  placeholder?: string;
  /** Accessible label for the input. */
  'aria-label'?: string;
  /** ID of the element that labels this input. */
  'aria-labelledby'?: string;
  /** Whether the input is disabled. */
  disabled?: boolean;
}

/**
 * Multi-select tag input with autocomplete dropdown.
 *
 * Renders selected tags as removable chips inside the input field.
 * Typing filters the suggestion dropdown. Supports creating new tags.
 */
export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add tags…',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  disabled = false,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const escapePressedRef = useRef(false);
  const listboxId = useId();
  const inputId = useId();

  // Filter suggestions based on input text and already-selected tags
  const filteredSuggestions = useMemo(() => {
    const query = inputValue.toLowerCase().trim();
    return suggestions.filter(
      (tag) => !value.includes(tag) && (query === '' || tag.toLowerCase().includes(query)),
    );
  }, [inputValue, suggestions, value]);

  // Show "create new" option when there's input that doesn't exactly match
  const showCreateOption = useMemo(() => {
    const trimmed = inputValue.trim();
    if (trimmed === '') return false;
    const lower = trimmed.toLowerCase();
    return (
      !value.some((t) => t.toLowerCase() === lower) &&
      !suggestions.some((t) => t.toLowerCase() === lower)
    );
  }, [inputValue, value, suggestions]);

  const totalOptions = filteredSuggestions.length + (showCreateOption ? 1 : 0);

  // Add a tag and clear input
  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed === '' || value.includes(trimmed)) return;
      onChange([...value, trimmed]);
      setInputValue('');
      setActiveIndex(-1);
      setIsOpen(false);
    },
    [value, onChange],
  );

  // Remove a tag by name
  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setIsOpen(true);
          setActiveIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setIsOpen(true);
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
          break;

        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filteredSuggestions.length) {
            addTag(filteredSuggestions[activeIndex]);
          } else if (activeIndex === filteredSuggestions.length && showCreateOption) {
            addTag(inputValue.trim());
          } else if (inputValue.trim()) {
            addTag(inputValue.trim());
          }
          break;

        case 'Escape':
          e.preventDefault();
          escapePressedRef.current = true;
          setIsOpen(false);
          setActiveIndex(-1);
          break;

        case 'Backspace':
          if (inputValue === '' && value.length > 0) {
            removeTag(value[value.length - 1]);
          }
          break;
      }
    },
    [
      activeIndex,
      addTag,
      filteredSuggestions,
      inputValue,
      removeTag,
      showCreateOption,
      totalOptions,
      value,
    ],
  );

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
    setActiveIndex(-1);
  }, []);

  // Close dropdown when clicking outside
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus the input when clicking the control area
  const handleControlClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const getOptionId = (index: number) => `${listboxId}-option-${index}`;

  const activeDescendant = activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  return (
    <div className="tag-input" ref={containerRef}>
      <div
        className="tag-input__control"
        onClick={handleControlClick}
        onKeyDown={() => inputRef.current?.focus()}
        role="group"
        aria-label="Selected tags"
      >
        {value.map((tag) => (
          <Tag key={tag} name={tag} size="sm" removable onRemove={removeTag} />
        ))}
        <input
          ref={inputRef}
          id={inputId}
          className="tag-input__text"
          type="text"
          role="combobox"
          aria-expanded={isOpen && totalOptions > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendant}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (escapePressedRef.current) {
              escapePressedRef.current = false;
              return;
            }
            setIsOpen(true);
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          autoComplete="off"
        />
      </div>

      {isOpen && totalOptions > 0 && (
        <ul
          id={listboxId}
          className="tag-input__dropdown"
          role="listbox"
          aria-label="Tag suggestions"
        >
          {filteredSuggestions.map((tag, index) => (
            <li
              key={tag}
              id={getOptionId(index)}
              className={`tag-input__option${index === activeIndex ? ' tag-input__option--active' : ''}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(tag);
              }}
            >
              {tag}
            </li>
          ))}
          {showCreateOption && (
            <li
              id={getOptionId(filteredSuggestions.length)}
              className={`tag-input__option tag-input__option--create${
                activeIndex === filteredSuggestions.length ? ' tag-input__option--active' : ''
              }`}
              role="option"
              aria-selected={activeIndex === filteredSuggestions.length}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(inputValue.trim());
              }}
            >
              Create &ldquo;{inputValue.trim()}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
