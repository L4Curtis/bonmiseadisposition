import * as path from 'path';

/**
 * Validate that an SMB/export path is not a system-critical directory
 * (Linux containers AND Windows hosts — UNC paths pass through).
 */
export function isSafeSmbExportPath(exportPath: string): boolean {
  if (!exportPath || typeof exportPath !== 'string') return false;
  const resolved = path.resolve(exportPath);
  const blockedUnix = ['/etc', '/proc', '/sys', '/dev', '/root', '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/lib', '/lib64', '/boot'];
  const blockedWindows = ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata'];
  const lower = resolved.toLowerCase();
  if (blockedUnix.some((b) => resolved === b || resolved.startsWith(b + '/'))) return false;
  if (blockedWindows.some((b) => lower === b || lower.startsWith(b + '\\'))) return false;
  return true;
}
