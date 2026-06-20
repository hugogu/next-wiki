/**
 * Application-owned placeholder served when an image's metadata exists and the
 * caller is authorized but the backend bytes cannot be retrieved (Edge Cases /
 * plan D3). Mirrors `public/images/content-unavailable.png`; embedded here so
 * the serving route never depends on the working directory or the filesystem.
 */
const BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4CAIAAAD6wG44AAABlklEQVR4nO3RQQnAQADEwPMvJcKqo6/lFJRCyCgI5BC183dAvtVguTv4iQjTYCemwU5Mg52YBjsxDXZiGuzENNiJabAT02AnpsFOTIOdmAY7MQ12YhrsxDTYiWmwE9NgJ6bBTkyDnZgGOzENdmIa7MQ02IlpsBPTYCemwU5Mg52YBjsxDXZiGuzENNiJabAT02AnpsFOTIOdmAY7MQ12YhrsxDTYiWmwE9NgJ6bBTkyDnZgGOzENdmIa7MQ02IlpsBPTYCemwU5Mg52YBjsxDXZiGuzENNiJabAT02AnpsFOTIOdmAY7MQ12YhrsxDTYiWmwE9NgJ6bBTkyDnZgGOzENdmIa7MQ02IlpsBPTYCemwU5Mg52YBjsxDXZiGuzENNiJabAT02AnpsFOTIOdmAY7MQ12YhrsxDTYiWmwE9NgJ6bBTkyDnZgGOzENdmIa7MQ02IlpsBPTYCemwU5Mg52YBjsxDXZiGuzENNiJabAT02AnpsFOTIOdmAY7MQ12YhrsxDTYiWmwE9NgJ+YOjlKD5Ros9wKqVK2cPWZMtQAAAABJRU5ErkJggg==';

export const UNAVAILABLE_IMAGE_BYTES = Buffer.from(BASE64, 'base64');
export const UNAVAILABLE_IMAGE_CONTENT_TYPE = 'image/png';
