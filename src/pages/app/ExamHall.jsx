import ExamPage from './ExamPage.jsx'

/** Same exam as CBT Mock, but students never see the result (admins and the teachers in charge of the student do, in Scoresheet). */
export default function ExamHall() {
  return <ExamPage kind="hall" />
}
