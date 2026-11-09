// BEM class names: block, block__element, block--modifier
const BEM = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$/;

// Corners come from the --radius-* scale in global.scss; only hairline values (1-3px) stay literal
const RADIUS =
  /^(var\(--radius[\w-]*\)|calc\(var\(--radius[\w-]*\) - \d+px\)|0|[1-3]px|50%|inherit|\s)+$/;

export default {
  extends: ['stylelint-config-standard-scss', 'stylelint-config-standard-vue/scss'],
  ignoreFiles: ['dist/**', 'coverage/**'],
  rules: {
    'selector-class-pattern': [BEM, { message: 'Use BEM class names (block__element--modifier)' }],
    'declaration-property-value-allowed-list': [
      { '/^border(-[a-z]+)*-radius$/': [RADIUS] },
      { message: 'Use a --radius-* token from global.scss' },
    ],
  },
};
