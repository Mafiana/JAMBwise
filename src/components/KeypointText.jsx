/** Shows the keypoints exactly as they were written in the text file: every line break, blank line and space is kept. */
export default function KeypointText({ text }) {
  return <div className="kp-text">{String(text ?? '')}</div>
}
