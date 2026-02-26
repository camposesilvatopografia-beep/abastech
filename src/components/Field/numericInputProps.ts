import React from 'react';

/**
 * Shared event handlers to prevent accidental value changes
 * on numeric inputs via mouse wheel or arrow keys.
 */
export const numericInputProps = {
  onWheel: (e: React.WheelEvent<HTMLInputElement>) => {
    (e.currentTarget as HTMLInputElement).blur();
  },
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
  },
};
