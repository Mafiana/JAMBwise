import ExamPage from './ExamPage.jsx'

/** Same exam as CBT Mock, but students never see the result (admins do, in Admin > Scoresheet). */
export default function ExamHall() {
  return <ExamPage kind="hall" />
}
