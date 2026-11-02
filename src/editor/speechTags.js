import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeFlow, readBlocks } from '../model/flow';
import { SPEECH_INFO, baseSpeech } from '../model/speeches';
// Doc view: label answers with their speech (e.g. "MG") so you can see what
// will land in which flow column without switching views.
const key = new PluginKey('pp-speech-tags');
export const SpeechTags = Extension.create({
    name: 'speechTags',
    addProseMirrorPlugins() {
        const build = (doc) => {
            const layout = computeFlow(readBlocks(doc));
            const decos = [];
            for (const sheet of layout.sheets) {
                const base = baseSpeech(sheet.side);
                for (const p of sheet.placements) {
                    if (!p.speech)
                        continue;
                    const node = doc.nodeAt(p.pos);
                    if (!node)
                        continue;
                    const tagged = node.attrs.kind === 'claim' ? p.speech !== base || node.attrs.newRow : !!node.attrs.speech;
                    if (!tagged)
                        continue;
                    decos.push(Decoration.node(p.pos, p.pos + node.nodeSize, {
                        'data-flow-speech': p.speech,
                        'data-flow-side': SPEECH_INFO[p.speech].side,
                    }));
                }
            }
            return decos;
        };
        return [
            new Plugin({
                key,
                state: {
                    init: (_c, state) => DecorationSet.create(state.doc, build(state.doc)),
                    apply: (tr, old, _o, state) => (tr.docChanged ? DecorationSet.create(state.doc, build(state.doc)) : old),
                },
                props: {
                    decorations: (state) => key.getState(state),
                },
            }),
        ];
    },
});
