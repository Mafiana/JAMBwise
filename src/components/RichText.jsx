import { parseRich } from '../lib/utils.js'

/** Shows question text with a few safe tags (<u>, <b>, <i>, <sub>, <sup>) as formatting. Anything else is shown as plain text. */
export default function RichText({ text }) {
  return parseRich(text).map((p, i) => (p.tag ? <p.tag key={i}>{p.text}</p.tag> : p.text))
}
