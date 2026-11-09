// Test values shaped like OpenAI keys, for the checks that look at the shape (format,
// redaction). They are built at runtime so that no key-like text sits in the repository,
// where a secret scanner, or a reader, could take it for a real one. None of them works.

const PREFIX = ['s', 'k', '-'].join('');

/** A made-up key in the OpenAI shape: the prefix, then `body` */
export function fakeOpenAiKey(body = 'FAKExFAKExFAKExFAKExFAKEx'): string {
  return `${PREFIX}${body}`;
}
