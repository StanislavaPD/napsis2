; Custom NSIS script for Напояване ХТР Ямбол installer
; Provides Bulgarian language strings and customizations
;
; IMPORTANT: This script is included AFTER electron-builder's main installer script
; Therefore, we should ONLY define things that electron-builder doesn't define
; All MUI_ defines that electron-builder creates will conflict, so avoid redefining them

; ============================================================================
; Branding
; ============================================================================

BrandingText "Напояване ХТР Ямбол v1.0 - made by инж. Станислава Димитрова"

; ============================================================================
; Custom Messages (These are safe to define)
; ============================================================================

; Bulgarian language strings - these won't conflict
LangString DESC_SecMain ${LANG_BULGARIAN} "Основни файлове на приложението"
LangString DESC_SecDesktop ${LANG_BULGARIAN} "Създаване на икона на работния плот"
LangString DESC_SecStartMenu ${LANG_BULGARIAN} "Създаване на икона в Start Menu"

; Installation messages
LangString MSG_RUNNING ${LANG_BULGARIAN} "Друга копие на Напояване ХТР Ямбол е стартирано. Моля, затворете го и опитайте отново."
LangString MSG_POSTGRESQL ${LANG_BULGARIAN} "PostgreSQL база данни ще бъде конфигурирана автоматично при първо стартиране."

; ============================================================================
; Additional Functions (optional, can be called from installer)
; ============================================================================

; Custom page for PostgreSQL info (optional)
Function ShowPostgreSQLInfo
  MessageBox MB_OK|MB_ICONINFORMATION "$(MSG_POSTGRESQL)"
FunctionEnd

; ============================================================================
; Modern UI Completion
; ============================================================================

; Progress bar customization
XPStyle on
