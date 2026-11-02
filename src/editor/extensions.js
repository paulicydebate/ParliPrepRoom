import { getSchema } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Highlight from '@tiptap/extension-highlight';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';
import Text from '@tiptap/extension-text';
import Underline from '@tiptap/extension-underline';
import { PrepBlock } from './PrepBlock';
/** The document schema: styled blocks with simple inline formatting. */
export function contentExtensions() {
    return [Document, Text, PrepBlock, HardBreak, Bold, Italic, Underline, Strike, Highlight];
}
export const schema = getSchema(contentExtensions());
/** Name of the Yjs field that holds a document's body. */
export const BODY_FIELD = 'default';
