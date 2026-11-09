// Public API of the settings module: the settings store (key, models, voice, spend limit),
// the language lists, the settings page and the selects other pages reuse.

export {
  API_PROVIDERS,
  toSpendLimit,
  useSettingsStore,
  type ModelRole,
  type QualityTier,
} from './store/useSettingsStore';
export { MAX_MEETING_LANGUAGES } from './store/meetingHints';
export { languageLabel, ORIGINAL_LANGUAGE, TARGET_LANGUAGES } from './languages';
export { isLikelyAzureKey, isLikelyOpenAiKey } from './utils/apiKey';
export { default as SettingsView } from './components/SettingsView/SettingsView.vue';
export { default as LanguageSelect } from './components/LanguageSelect/LanguageSelect.vue';
export { default as UiBrandSelect } from './components/UiBrandSelect/UiBrandSelect.vue';
export { default as UiLocaleSelect } from './components/UiLocaleSelect/UiLocaleSelect.vue';
export { default as UiThemeSelect } from './components/UiThemeSelect/UiThemeSelect.vue';
