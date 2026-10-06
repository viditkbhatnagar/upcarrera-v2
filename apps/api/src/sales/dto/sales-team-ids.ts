/**
 * sales_team.leader is a VarChar(10) that holds a users.id, and sales_team.members
 * is a JSON array of users.id. Neither column can tell a name from an id, so the
 * API has to: the old Create Team dialog sent "Priya Sharma" as the leader and
 * "UC-91" display codes as members, and both were stored verbatim (QA T01).
 */
export const LEADER_ID_PATTERN = /^[1-9]\d*$/;
export const LEADER_ID_MESSAGE = 'leader must be a user id (digits only)';

/** True when `value` is a positive integer users.id, as a number or a digit string. */
export function isUserId(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0;
  if (typeof value === 'string') return LEADER_ID_PATTERN.test(value.trim());
  return false;
}
