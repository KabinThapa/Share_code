export const scenarios = [
  {
    id: "paragraph-insert-edit-format",
    name: "Inserted paragraphs + edited original + format change",
    before: `
      <h2>Riverside Case Notes</h2>
      <p>The detective reviewed the witness statement before midnight.</p>
      <p>The second report explains the final decision. It was approved by the team after legal review.</p>
      <p>The archive contains <strong>verified evidence</strong> and a timeline of events.</p>
      <p>Water sample H<sub>2</sub>O was logged during the forensic review.</p>
    `,
    after: `
      <h2>Riverside Case Summary</h2>
      <p>The detective reviewed the witness statement before midnight.</p>
      <p>A new paragraph was inserted about camera footage near the motel entrance.</p>
      <p>Another inserted paragraph records the suspect's timeline from 8 PM to 11 PM.</p>
      <p>The second report describes the final decision. It was approved by the product team after legal review.</p>
      <p>The archive contains <strong><em>verified evidence</em></strong> and a timeline of events.</p>
      <p>Water sample H<sub>2</sub>O was logged during the forensic review, with result 2<sup>nd</sup> priority.</p>
    `
  },
  {
    id: "sentence-replacement",
    name: "Sentence removed and new sentence introduced",
    before: `
      <p>The detective reviewed the file. The witness arrived before midnight. The record was stored securely.</p>
    `,
    after: `
      <p>The detective reviewed the file. The camera footage was recovered later. The record was stored securely.</p>
    `
  },
  {
    id: "large-format-range",
    name: "Large paragraph formatting change",
    before: `
      <p>This long paragraph has many words and remains textually unchanged. The purpose of the case note is to confirm that formatting over a large range is grouped into one readable change.</p>
    `,
    after: `
      <p><em>This long paragraph has many words and remains textually unchanged. The purpose of the case note is to confirm that formatting over a large range is grouped into one readable change.</em></p>
    `
  },
  {
    id: "table-row-cell",
    name: "Table row insertion and cell edit",
    before: `
      <h2>Case Register</h2>
      <table>
        <thead><tr><th>Case</th><th>Owner</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Case A</td><td>Maya</td><td>Open</td></tr>
          <tr><td>Case C</td><td>Kabin</td><td>Closed</td></tr>
        </tbody>
      </table>
    `,
    after: `
      <h2>Case Register</h2>
      <table>
        <thead><tr><th>Case</th><th>Owner</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>Case A</td><td>Maya</td><td>Open</td></tr>
          <tr><td>Case B</td><td>Riya</td><td>Pending</td></tr>
          <tr><td>Case C</td><td>Kabin</td><td>Reopened</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: "structure-list",
    name: "Structure changes",
    before: `
      <p>Project Goals</p>
      <p>Review source files</p>
      <p>Prepare final report</p>
    `,
    after: `
      <h2>Project Goals</h2>
      <ul>
        <li>Review source files</li>
        <li><strong>Prepare final report</strong></li>
      </ul>
    `
  }
];

