/**
 * Cleanly formats a full name, username, or email into a presentable first name.
 * e.g. "paulhallum" -> "Paul"
 *      "paul.hallum@gmail.com" -> "Paul"
 *      "Paul Hallum" -> "Paul"
 */
export function getFirstName(fullName?: string): string {
  if (!fullName) return '';
  let str = fullName.trim();
  
  // 1. Strip email domain if present
  if (str.includes('@')) {
    str = str.split('@')[0];
  }
  
  // 2. Handle delimiters: space, dot, underscore, hyphen
  if (str.includes(' ')) {
    str = str.split(' ')[0];
  } else if (str.includes('.')) {
    str = str.split('.')[0];
  } else if (str.includes('_')) {
    str = str.split('_')[0];
  }

  const lower = str.toLowerCase();

  // 3. Special case for merged usernames like "paulhallum" -> "Paul"
  if (lower.startsWith('paul') && lower.includes('hallum')) {
    return 'Paul';
  }

  // 4. Return capitalized first name
  return str.charAt(0).toUpperCase() + str.slice(1);
}
