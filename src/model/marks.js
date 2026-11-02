// Flow marks: how an argument stands in the round, like the shorthand people
// draw on a paper flow.
export const FLOW_MARKS = [
    { mark: 'extend', label: 'Extend', key: 'E', hint: 'Extended into a later speech' },
    { mark: 'dropped', label: 'Dropped', key: 'D', hint: 'The other side never answered it' },
    { mark: 'answered', label: 'Answered', key: 'A', hint: 'Answered (crossed out, like on a paper flow)' },
    { mark: 'key', label: 'Key', key: 'K', hint: 'Key argument: go for it' },
];
export function isFlowMark(v) {
    return v === 'extend' || v === 'dropped' || v === 'answered' || v === 'key';
}
