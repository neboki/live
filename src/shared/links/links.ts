export const REPO_URL = 'https://github.com/neboki/live';
/** The app's start screen: the root of the app (/app/ on the website) */
export const HOME_URL = import.meta.env.BASE_URL;
/**
 * The website with the landing page. On the website the app sits under /app/ and the
 * landing at the root; the phone app and local runs have no landing, so they link to
 * the published one.
 */
export const SITE_URL: string =
  import.meta.env.MODE === 'web' ? '/' : 'https://neboki-live.web.app/';
/**
 * The in-app privacy and security page. It has its own address so stores and emails can
 * link to it.
 */
export const PRIVACY_PATH = `${import.meta.env.BASE_URL}privacy`;
/** Where people write about their data or report a security problem */
export const PRIVACY_CONTACT = 'neboki@neboki.com';
