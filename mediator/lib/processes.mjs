import { readFile } from 'node:fs/promises';

export async function processIdentity(pid) {
  const [stat, status] = await Promise.all([
    readFile(`/proc/${pid}/stat`, 'utf8'),
    readFile(`/proc/${pid}/status`, 'utf8'),
  ]);
  const end = stat.lastIndexOf(')');
  const fields = stat.slice(end + 1).trim().split(/\s+/);
  const uids = status.match(/^Uid:\s+(\d+)\s+(\d+)/m);
  if (end < 0 || !uids || !fields[19]) throw new Error('Process identity is unavailable.');
  return { pid, name: stat.slice(stat.indexOf('(') + 1, end), startTime: fields[19], uid: Number(uids[1]), euid: Number(uids[2]) };
}
