"use client";

import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { KeyboardShortcutsModal } from "@/components/ui/KeyboardShortcutsModal";

/**
 * ShortcutsProvider
 *
 * Client component that registers global keyboard shortcuts and renders the
 * modal.  Imported into the root Server layout so the modal is available on
 * every page without making the whole layout a Client Component.
 */
export function ShortcutsProvider() {
  const { showShortcutsModal, closeShortcutsModal } = useKeyboardShortcuts();

  return (
    <KeyboardShortcutsModal open={showShortcutsModal} onClose={closeShortcutsModal} />
  );
}
