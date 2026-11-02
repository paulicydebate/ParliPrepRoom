// Flow marks: how an argument stands in the round, like the shorthand people
// draw on a paper flow.

export type FlowMark = 'extend' | 'dropped' | 'answered' | 'key';

export const FLOW_MARKS: { mark: FlowMark; label: string; key: string; hint: string }[] = [
  { mark: 'extend', label: 'Extend', key: 'E', hint: 'Extended into a later speech' },
  { mark: 'dropped', label: 'Dropped', key: 'D', hint: 'The other side never answered it' },
  { mark: 'answered', label: 'Answered', key: 'A', hint: 'Answered (crossed out, like on a paper flow)' },
  { mark: 'key', label: 'Key', key: 'K', hint: 'Key argument: go for it' },
];

export function isFlowMark(v: unknown): v is FlowMark {
  return v === 'extend' || v === 'dropped' || v === 'answered' || v === 'key';
}
