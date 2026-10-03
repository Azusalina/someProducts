/* Original teaching material. Official documents determine the coverage, not the wording. */
(() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sql = (query, explanation = '', runnable = true) => `<div class="code-block"><div class="code-head"><span>${runnable ? 'SQL · TRY IT YOURSELF' : 'SQL · DIALECT / CONCEPT EXAMPLE'}</span>${runnable ? `<button type="button" data-sql="${esc(query)}">Open in SQL lab ↗</button>` : ''}</div><pre><code>${esc(query)}</code></pre>${explanation ? `<p class="explain">${explanation}</p>` : ''}</div>`;
  const table = (heads, rows) => `<div class="table-wrap"><table><thead><tr>${heads.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const note = (title, text) => `<div class="note"><b>${title}</b> ${text}</div>`;
  const exercise = (question, answer) => `<div class="exercise"><div class="section-label">EXPLAIN IT / APPLY IT</div><p>${question}</p><details><summary>Reveal a model answer</summary><div>${answer}</div></details></div>`;
  const q = (text, options, answer, explain) => ({text,options,answer,explain});
  window.ICT_SEED = `PRAGMA foreign_keys = ON;
CREATE TABLE Student (
  student_id INTEGER NOT NULL PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  class VARCHAR(2) NOT NULL,
  house VARCHAR(10) NOT NULL,
  email VARCHAR(80) UNIQUE,
  join_date DATE NOT NULL
);
CREATE TABLE Course (
  course_id VARCHAR(3) NOT NULL PRIMARY KEY,
  title VARCHAR(40) NOT NULL,
  fee DECIMAL(8,2) NOT NULL CHECK (fee >= 0)
);
CREATE TABLE Enrollment (
  student_id INTEGER NOT NULL,
  course_id VARCHAR(3) NOT NULL,
  mark INTEGER CHECK (mark BETWEEN 0 AND 100),
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES Student(student_id),
  FOREIGN KEY (course_id) REFERENCES Course(course_id)
);
INSERT INTO Student VALUES
 (1,'Ada','5A','Red','ada@school.test','2025-09-01'),
 (2,'Ben','5A','Blue','ben@school.test','2025-09-01'),
 (3,'Chloe','5B','Red','chloe@school.test','2025-09-02'),
 (4,'Daniel','5B','Green','daniel@school.test','2025-09-02'),
 (5,'Eva','5A','Blue',NULL,'2025-09-03'),
 (6,'Felix','5B','Green',NULL,'2025-09-03');
INSERT INTO Course VALUES
 ('ICT','Information Technology',100),
 ('BIO','Biology',120),
 ('ART','Art',80),
 ('MUS','Music',90);
INSERT INTO Enrollment VALUES
 (1,'ICT',88),(1,'BIO',75),(2,'ICT',60),(2,'ART',82),
 (3,'ICT',95),(3,'BIO',90),(4,'BIO',55),(5,'ICT',NULL),(5,'ART',70);`;
  window.ICT_TABLE = table;
  window.ICT_ESC = esc;
  window.ICT_LESSONS = [
  {
    id:'foundations', title:'Database foundations', group:'Foundations', scope:'Compulsory + elective',
    heading:'From scattered data to <em>useful information.</em>',
    intro:'A database is an organised collection of related data. A database management system (DBMS) is the software used to define, store, retrieve and control that data.',
    tags:['Fields & records','DBMS','Data control','Forms & reports'],
    body:`<div class="flow"><span>Character / data item</span><i>→</i><span>Field</span><i>→</i><span>Record</span><i>→</i><span>File / table</span><i>→</i><span>Database</span></div>
    <p>In a school system, <strong>Ada</strong> is a field value. The <code>name</code> column is a field (attribute); all of Ada’s values form a record (row). Student records form a table. Related tables together form the school database. A file is a stored collection of records; a modern database may use several physical files, so a table need not correspond to exactly one disk file.</p>
    <div class="two-col"><div class="card"><div class="index">DATA</div><h3>Individual facts</h3><p>Marks: 88, 60, 95. These values need context: whose marks, which course and which assessment?</p></div><div class="card"><div class="index">INFORMATION</div><h3>Facts interpreted for a purpose</h3><p>The average of the three recorded ICT marks is 81. A teacher can use this summary when planning revision.</p></div></div>
    <h2>Why use a DBMS?</h2>
    ${table(['Function','What it does','School example'],[['Definition & storage','Defines tables, fields, types and constraints.','Student IDs must be unique.'],['Retrieval & updates','Runs queries and adds, edits or removes records.','Find every student in class 5A.'],['Integrity & sharing','Enforces rules and coordinates shared access.','An enrolment must refer to a real student.'],['Security & recovery','Restricts access; supports backups and transactions.','A student sees only their own record.']])}
    <p>Separate files often duplicate the same names and contact details. A shared database can reduce inconsistent copies and centralise rules. The costs include design effort, administration, training, hardware/software resources and the impact of a central failure. A database still needs tested backups and sensible access policies.</p>
    <h2>Sequential and direct access</h2>
    ${table(['Access','How retrieval works','Strength / limitation','Suitable use'],[['Sequential','Read records in sequence until reaching the target.','Simple for processing every record; slow for an arbitrary record.','Batch payroll or a magnetic-tape archive.'],['Direct / random','Locate a record without reading all earlier records, using an address or lookup mechanism.','Fast targeted retrieval; requires a suitable storage/index structure.','Look up a student ID on disk or SSD.']])}
    <p>An index helps the DBMS locate matching rows. Physical storage access and the SQL result order are different: direct access does not imply sorted output. Use <code>ORDER BY</code> when the output order matters.</p>
    <h2>Validation, verification and error detection</h2>
    ${table(['Control','Example','What it cannot prove'],[['Presence check','Reject a blank required name.','That the name is correct.'],['Type / range check','Accept an integer mark from 0 to 100.','That 88 was not mistyped as 89.'],['Length / format check','Check a student code has the expected pattern.','That the code belongs to this student.'],['Lookup / consistency check','Check the course exists; end date is not before start date.','That the user chose the intended course.'],['Check digit','Recalculate a code’s check digit.','That all possible transcription errors are detected.'],['Verification','Double entry or compare against the original document.','That the original source itself is accurate.'],['Parity check','Add a bit to make the total number of 1s even or odd.','That an even number of bit flips is detected; it does not correct the data.']])}
    <p>For even parity, data <code>1011001</code> has four 1s, so its parity bit is 0. One changed bit produces odd parity and flags an error. Two changed bits may pass. Parity addresses transmission/storage errors; it is not a check that a student’s mark is plausible.</p>
    <h2>Tables, queries, forms and reports</h2>
    <p>A <strong>table</strong> stores records. A <strong>query</strong> selects or changes data. A <strong>form</strong> offers an entry interface with labels, input controls, validation and feedback. A <strong>report</strong> presents selected data for an audience, with meaningful headings, grouping, totals and formatting. A form is not a separate copy of every record; it reads or writes the underlying tables.</p>
    ${sql("SELECT name, class\nFROM Student\nWHERE class = '5A'\nORDER BY name;",'Result: Ada, Ben and Eva. These are the three rows a class-list report should show.')}
    ${exercise('A form accepts the mark 89, although the paper record says 88. Explain why validation can pass and how verification could help.','89 has the correct type and is within range. Comparing the entry with the paper, or double entry with mismatch detection, can expose the transcription error. Neither method guarantees the paper is correct.')}`,
    quiz:[q('Which object normally stores the school records?', ['A report','A table','A data-entry form'],1,'Tables store records; forms and reports provide interfaces or presentations.'),q('Which error can even parity fail to detect?', ['One flipped bit','Three flipped bits','Two flipped bits'],2,'Any even number of bit flips preserves the parity.')]
  },
  {
    id:'keys',title:'Relational model & keys',group:'Foundations',scope:'Elective',
    heading:'Give every fact <em>a reliable identity.</em>',
    intro:'A relational database organises data into relations (tables). Rows describe instances; columns describe attributes. Keys let us identify rows and connect tables without relying on names.',
    tags:['Entity','Attribute & domain','Candidate keys','Indexes'],
    body:`<h2>Read the model before writing SQL</h2>
    ${table(['Term','Meaning','Example'],[['Entity','A kind of thing about which we store facts.','Student or Course.'],['Entity instance / record','One specific thing.','Ada, identified by student_id 1.'],['Attribute','A property of an entity.','Student.name or Course.fee.'],['Domain','The allowed set of values for an attribute.','Marks are integers 0–100, or NULL if not recorded.'],['Relationship','An association between entity instances.','Ada enrols in ICT.'],['Schema','The structure and constraints, rather than current rows.','Student(student_id, name, class, house, email, join_date).']])}
    <h2>Four key distinctions</h2>
    ${table(['Key','Definition','Apply it'],[['Candidate key','A minimal set of attributes that uniquely identifies a row.','A guaranteed unique, required student ID is a candidate. Removing any attribute from a composite candidate destroys uniqueness.'],['Primary key (PK)','The candidate key selected as the main identifier. Unique and non-NULL.','Student.student_id.'],['Alternate key','A candidate key not chosen as the primary key.','A required and guaranteed unique admission number, if the system stores one.'],['Foreign key (FK)','Attribute(s) referencing a parent key in another table, or the same table.','Enrollment.student_id references Student.student_id.'],['Composite key','A key made from more than one attribute.','Enrollment uses (student_id, course_id). Neither attribute alone identifies an enrolment.']])}
    ${note('Minimal means no unnecessary attributes.','If student_id alone is unique, (student_id, name) is a superkey but not a candidate key. Names and classes can repeat; they are unsuitable identifiers. An optional email with NULL values is not a candidate key in our model, even with a UNIQUE constraint.')}
    <h2>Our three-table database</h2>
    ${table(['Table','Primary key','Foreign keys','Other attributes'],[['Student','student_id','None','name, class, house, email, join_date'],['Course','course_id','None','title, fee'],['Enrollment','(student_id, course_id)','student_id → Student; course_id → Course','mark']])}
    <p>Ada can appear in multiple enrolments, and ICT can have multiple students. Repeating a foreign-key value is allowed. Repeating the <em>pair</em> (1, ICT) is not, because that pair is the primary key.</p>
    <h2>Indexes: quicker reads, extra work on writes</h2>
    <p>An index is a lookup structure on one or more columns. It can accelerate filtering, joining or sorting, but consumes storage and must be maintained when rows change. Index a frequently searched field after considering the workload. An index alone is not a data-integrity rule unless it enforces uniqueness.</p>
    ${sql('CREATE INDEX idx_student_class ON Student(class);\nSELECT name FROM Student WHERE class = \'5A\';','Creating the index changes the access structure, not the student records. Reset the lab before running the CREATE again.')}
    ${exercise('A club stores Attendance(student_id, meeting_date, present). Each student has at most one attendance record per meeting. Propose a primary key and a foreign key.','Use (student_id, meeting_date) as a composite primary key. student_id is a foreign key to Student. A student attends many meetings and many students attend one date, so neither column alone is unique.')}`,
    quiz:[q('Can a foreign-key value appear in several child rows?', ['Yes','No, it must always be unique','Only when it is NULL'],0,'Several enrolments can reference the same Student record.'),q('Which identifies one enrolment in this model?', ['student_id','course_id','(student_id, course_id)'],2,'The pair is unique; either individual value can repeat.')]
  },
  {
    id:'integrity',title:'Data types & integrity',group:'Foundations',scope:'Elective',
    heading:'Make invalid states <em>harder to store.</em>',
    intro:'Integrity means data obey the model’s rules. Define the rules in the database as well as checking inputs in a form.',
    tags:['Entity integrity','Referential integrity','Domain integrity','NULL'],
    body:`${table(['Integrity','Rule','Violation'],[['Entity integrity','Every primary-key value is unique and non-NULL.','Two students with ID 1.'],['Referential integrity','A non-NULL foreign key matches an existing referenced key.','An enrolment for student 99 when no such student exists.'],['Domain integrity','Values belong to the attribute’s permitted domain.','A mark of 130 or a negative course fee.']])}
    <h2>Choose a type for the meaning</h2>
    ${table(['Type family','Appropriate data','Design consideration'],[['INTEGER','Whole-number marks or quantities.','A telephone number or identifier with leading zeros is usually text, not a number to calculate with.'],['DECIMAL(p,s)','Money requiring fixed decimal precision.','DECIMAL(8,2) allows eight total digits, two after the decimal point in DBMSs that enforce it.'],['CHAR(n) / VARCHAR(n)','Fixed-length codes / variable-length names.','Set sensible lengths; support the character set needed.'],['DATE / DATETIME','Dates / dates and times.','Use unambiguous formats, not an informal string such as 3/4/26.'],['BOOLEAN','True/false flags.','Representation and accepted literals differ by DBMS.']])}
    ${sql(`CREATE TABLE PracticeMark (
  student_id INTEGER NOT NULL,
  course_id VARCHAR(3) NOT NULL,
  mark INTEGER CHECK (mark BETWEEN 0 AND 100),
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES Student(student_id),
  FOREIGN KEY (course_id) REFERENCES Course(course_id)
);
INSERT INTO PracticeMark VALUES (1, 'ICT', 88);
SELECT * FROM PracticeMark;`,'NOT NULL requires a value; UNIQUE rejects duplicate non-NULL values; CHECK tests a condition; DEFAULT supplies a value if the column is omitted. A default does not validate a supplied value.')}
    <h2>NULL is missing, unknown or inapplicable</h2>
    <p>Eva’s ICT mark is <code>NULL</code>: it has not been recorded. It is not zero, an empty string, or the text <code>'NULL'</code>. Use <code>IS NULL</code> or <code>IS NOT NULL</code>. A comparison such as <code>mark = NULL</code> is unknown, so it does not select those rows. A WHERE condition keeps rows for which the condition is true.</p>
    ${sql("SELECT student_id, course_id\nFROM Enrollment\nWHERE mark IS NULL;",'Result: student 5, ICT.')}
    <p>A nullable foreign key can represent an optional relationship. A NOT NULL foreign key requires a parent. On deletion, a DBMS can reject a referenced parent, cascade deletions, or set nullable references to NULL, depending on the rule. Our sample database uses the default restrictive behaviour; deleting Student 1 is rejected while enrolments refer to that student.</p>
    ${note('SQLite is a practice dialect.','The lab enables foreign-key checks. SQLite does not enforce VARCHAR length or DECIMAL precision like many other DBMSs and generally uses flexible typing. Its DATE values here are ISO-formatted text. A successful lab insert alone does not prove that the same type constraints would pass on another DBMS.')}
    ${exercise('Why can mark CHECK (mark BETWEEN 0 AND 100) still allow NULL? How would you require a recorded mark?','A CHECK rejects false, but a NULL/unknown check does not fail in SQLite. Add NOT NULL as well if a mark is mandatory. In this example, NULL is intentionally allowed for a result not yet recorded.')}`,
    quiz:[q('An enrolment references a student who does not exist. Which integrity rule is broken?', ['Entity','Referential','Domain only'],1,'The foreign key does not match an existing parent key.'),q('Which finds missing marks?', ['mark = NULL','mark = 0','mark IS NULL'],2,'NULL needs IS NULL; equality with NULL is not true.')]
  },
  {
    id:'er',title:'ER diagrams & relationships',group:'Design',scope:'Elective',
    heading:'Model the rules <em>before the tables.</em>',
    intro:'An entity–relationship (ER) diagram describes entities, their attributes and associations. Cardinality sets the maximum number of related instances; participation sets whether a relationship is required.',
    tags:['Binary relationships','1:1 / 1:M / M:N','Participation','ER → tables'],
    body:`<h2>Start with a short requirement</h2><p>A school offers courses. A student may enrol in several courses. A course may have several students. Every enrolment belongs to exactly one student and one course, and has a mark that may not yet be recorded. This describes an M:N relationship with an attribute on the relationship.</p>
    <div class="diagram"><svg viewBox="0 0 760 220" role="img" aria-label="Chen ER diagram: Student and Course have a many-to-many Enrols relationship. student_id and course_id are underlined key attributes. Mark is an attribute of the relationship. Both entities have optional participation."><ellipse class="attr" cx="120" cy="35" rx="67" ry="22"/><text x="120" y="40" text-anchor="middle" text-decoration="underline">student_id</text><line x1="120" y1="57" x2="120" y2="110"/><rect class="box" x="45" y="110" width="150" height="55"/><text x="120" y="143" text-anchor="middle">Student</text><line x1="195" y1="137" x2="308" y2="137"/><text x="244" y="121">M</text><polygon class="relation" points="380,96 452,137 380,178 308,137"/><text x="380" y="142" text-anchor="middle">Enrols</text><line x1="452" y1="137" x2="565" y2="137"/><text x="502" y="121">N</text><rect class="box" x="565" y="110" width="150" height="55"/><text x="640" y="143" text-anchor="middle">Course</text><ellipse class="attr" cx="640" cy="35" rx="64" ry="22"/><text x="640" y="40" text-anchor="middle" text-decoration="underline">course_id</text><line x1="640" y1="57" x2="640" y2="110"/><ellipse class="attr" cx="380" cy="35" rx="48" ry="22"/><text x="380" y="40" text-anchor="middle">mark</text><line x1="380" y1="57" x2="380" y2="96"/><text x="380" y="209" text-anchor="middle">Conceptual M:N model · single lines = optional participation</text></svg></div>
    <p class="caption">On a narrow screen, swipe across the diagram to see both entities.</p>
    <p>In Chen notation, a rectangle is an entity, an ellipse an attribute, an underlined attribute a key, and a diamond a relationship. A single connecting line represents optional participation; a double line represents mandatory participation. Label 1, M or N for cardinality. Only binary relationships (between two entity types, including a self-relationship) are needed here.</p>
    ${table(['Relationship','Example','Conversion to tables'],[['1:1','A student has at most one locker; a locker is assigned to at most one student.','Put a foreign key on a suitable side and make it UNIQUE. Use NOT NULL if participation on that side is mandatory.'],['1:M','One department offers many courses; a course belongs to one department.','Put department_id as a foreign key in Course, the many side.'],['M:N','Many students take many courses.','Create a linking table Enrollment with both foreign keys and any relationship attributes.']])}
    <h2>Resolve M:N into two 1:M relationships</h2>
    <div class="diagram"><svg viewBox="0 0 760 125" role="img" aria-label="Student one to many Enrollment, Course one to many Enrollment. Each Enrollment requires exactly one Student and exactly one Course."><rect class="box" x="15" y="22" width="160" height="70"/><text x="95" y="48" text-anchor="middle">Student</text><text x="95" y="74" text-anchor="middle">PK student_id</text><rect class="box" x="292" y="15" width="176" height="86"/><text x="380" y="40" text-anchor="middle">Enrollment</text><text x="380" y="64" text-anchor="middle">PK / FK student_id</text><text x="380" y="85" text-anchor="middle">PK / FK course_id</text><rect class="box" x="585" y="22" width="160" height="70"/><text x="665" y="48" text-anchor="middle">Course</text><text x="665" y="74" text-anchor="middle">PK course_id</text><line x1="175" y1="54" x2="292" y2="54"/><text x="186" y="43">1</text><text x="261" y="43">M</text><line x1="468" y1="54" x2="585" y2="54"/><text x="481" y="43">M</text><text x="565" y="43">1</text><text x="380" y="120" text-anchor="middle">Relational mapping · mark belongs in Enrollment</text></svg></div>
    <p>Store <code>mark</code> in Enrollment because it depends on a particular student–course pair. It is not a single property of Student or Course. The two foreign keys are NOT NULL: each enrolment requires both parents. A student may have zero enrolments and a course may be empty; a foreign key does not require each parent to have a child.</p>
    <h2>A repeatable design method</h2>
    <ol><li>Identify the information needed and the business rules. State assumptions.</li><li>Identify entities, attributes, domains and candidate keys.</li><li>Draw binary relationships with cardinalities and participation.</li><li>Map entities to tables; resolve M:N relationships with linking tables.</li><li>Normalise, define constraints, and test sample records and queries.</li><li>Review privacy, access rights and performance against the requirements.</li></ol>
    ${exercise('One author writes many books, and a book can have multiple authors. Where should the author’s contribution order be stored?','Create Author, Book and Authorship(author_id, book_id, contribution_order). The two IDs identify the association. Order belongs to Authorship because the same author can occupy a different order for a different book. It does not belong exclusively to Author or Book.')}`,
    quiz:[q('Where is the foreign key usually placed for a 1:M relationship?', ['In the one side only','In the many side','In neither table'],1,'Each row on the many side references its parent.'),q('What resolves a many-to-many relationship?', ['A comma-separated list in one field','A linking table with two foreign keys','A larger VARCHAR'],1,'The linking table represents individual associations and supports constraints and queries.')]
  },
  {
    id:'normalisation',title:'Normalisation & denormalisation',group:'Design',scope:'Elective',
    heading:'Store a fact once, <em>in the right place.</em>',
    intro:'Normalisation uses functional dependencies to reduce avoidable duplication and anomalies. Work from the business rules, not from a coincidence in a few sample rows.',
    tags:['Functional dependency','1NF → 2NF → 3NF','Anomalies','Denormalisation'],
    body:`<h2>One wide table, three problems</h2>
    ${table(['student_id','name','course_id','course_title','fee','mark'],[['1','Ada','ICT','Information Technology','100','88'],['1','Ada','BIO','Biology','120','75'],['2','Ben','ICT','Information Technology','100','60']])}
    <p>Assume one result per student per course. The key is <code>(student_id, course_id)</code>. Student names repeat across courses; course titles and fees repeat across students.</p>
    ${table(['Anomaly','What goes wrong'],[['Update','Changing the ICT fee requires changing every ICT enrolment row; missed rows disagree.'],['Insertion','A course with no enrolled students cannot be stored without inventing part of the key or introducing an invalid enrolment.'],['Deletion','Deleting the last enrolment for a course also loses the course’s title and fee.']])}
    <h2>Identify dependencies</h2>
    <div class="flow"><span>student_id → name, class, house, email, join_date</span><span>course_id → title, fee</span><span>(student_id, course_id) → mark</span></div>
    <p><code>X → Y</code> means each allowed X value determines one Y value. It does not mean Y is unique or that X numerically calculates Y. Names are not assumed to determine IDs.</p>
    ${table(['Normal form','Requirement','Action'],[['1NF','Every field holds one atomic value for the chosen domain; no repeating groups.','Replace a list of course codes in one field with one row per enrolment. Identify keys.'],['2NF','In 1NF; every non-key attribute depends on the whole of every candidate key, without a partial dependency.','Move student facts into Student and course facts into Course. Keep mark with the pair.'],['3NF','In 2NF; eliminate transitive dependencies of non-key attributes on a key through another non-key attribute.','If class → room, put the class–room fact in ClassRoom, not on every Student row.']])}
    <div class="tabs interactive-only" role="group" aria-label="Normalisation stages"><button data-normal="0" aria-pressed="true">1NF: wide relation</button><button data-normal="1" aria-pressed="false">2NF: split facts</button><button data-normal="2" aria-pressed="false">3NF: remove a chain</button></div><div id="normal-output" class="normal-output interactive-only"></div>
    <h2>A concrete transitive dependency</h2>
    <p>Suppose <code>Student(student_id, name, class, room)</code> and the rule is that each class has exactly one room. Then <code>student_id → class → room</code>. The key determines room through a non-key class. Decompose into <code>Student(student_id, name, class)</code> and <code>ClassRoom(class, room)</code>, with class as the ClassRoom primary key and a Student foreign key. If students can have different rooms within a class, that assumed dependency does not hold.</p>
    ${note('A single-column key is not automatically 3NF.','It eliminates partial dependency on part of that key, but transitive dependencies can remain. In exam answers, show the original key, dependencies, resulting tables, primary keys and foreign keys.')}
    <h2>Denormalisation: deliberate duplication</h2>
    <p>After measuring a performance need, a designer may add a stored summary or duplicate selected data to reduce expensive joins or repeated calculations. For example, maintain a course’s enrolment count for a heavily used dashboard. Procedure: choose the bottleneck, decide the duplicated data, define how every insert/update/delete keeps it consistent, test correctness and speed, then document the trade-off. Storage and update complexity increase; inconsistent copies become possible. Do not denormalise merely because joins exist.</p>
    ${exercise('OrderLine(order_id, product_id, product_name, quantity) has key (order_id, product_id). product_id determines product_name. Which normal form is violated, and how do you fix it?','It is in 1NF if all values are atomic, but not 2NF: product_name depends on only part of the composite key. Use Product(product_id PK, product_name) and OrderLine(order_id, product_id, quantity), with the pair as PK and product_id as FK. Assuming the stated rules and no further dependencies, the split can also satisfy 3NF.')}`,
    quiz:[q('A non-key attribute depends on only part of a composite candidate key. What is the issue?', ['Partial dependency: violates 2NF','Transitive dependency only','An outer join'],0,'2NF removes partial dependencies of non-key attributes on candidate keys.'),q('Why denormalise after measuring a need?', ['To guarantee fewer update errors','To improve a specific read workload, accepting maintenance costs','To remove all keys'],1,'Deliberate redundancy can reduce read costs, but adds storage and consistency work.')]
  },
  {
    id:'select',title:'SELECT, sorting & tracing',group:'SQL',scope:'Compulsory + elective',
    heading:'Ask a precise question. <em>Read a precise result.</em>',
    intro:'SELECT chooses output columns. FROM supplies the input rows. WHERE keeps matching rows. ORDER BY sorts the final result. Trace each clause rather than guessing from keywords.',
    tags:['SELECT / FROM','WHERE','ORDER BY','DISTINCT & aliases'],
    body:`${sql("SELECT student_id, name\nFROM Student\nWHERE class = '5A'\nORDER BY name ASC;",'Output columns: student_id and name. Output rows: (1, Ada), (2, Ben), (5, Eva).')}
    ${table(['Clause / feature','Meaning','Example'],[['SELECT *','All columns; convenient for inspection.','SELECT * FROM Student;'],['Projection','Choose the required fields and their order.','SELECT name, house FROM Student;'],['DISTINCT','Remove duplicates across the entire selected combination.','SELECT DISTINCT house FROM Student;'],['AS alias','Give an output expression a readable heading.','SELECT name AS student_name FROM Student;'],['ORDER BY','Sort ascending (ASC, default) or descending (DESC).','ORDER BY class ASC, name DESC'],['Arithmetic expression','Calculate an output value without modifying stored data.','SELECT title, fee * 1.1 AS revised_fee FROM Course;']])}
    <p>For multi-column sorting, first compare the first sort key, then break ties using the second. Include a unique tie-breaker when you need a fully determined order. Without ORDER BY, no specific row order is guaranteed.</p>
    <h2>Trace the query in stages</h2>
    <div class="tabs interactive-only" role="group" aria-label="Query trace stages"><button data-trace="0" aria-pressed="true">1 · FROM</button><button data-trace="1" aria-pressed="false">2 · WHERE</button><button data-trace="2" aria-pressed="false">3 · SELECT</button><button data-trace="3" aria-pressed="false">4 · ORDER BY</button></div><div id="trace-output" class="trace-output interactive-only"></div>
    <p class="caption">This is a reasoning model for a simple query; it is not a claim about the DBMS’s physical execution plan.</p>
    ${sql("SELECT DISTINCT class, house\nFROM Student\nORDER BY class, house;",'Four distinct pairs survive: 5A/Blue, 5A/Red, 5B/Green, 5B/Red. Daniel and Felix share 5B/Green; Ben and Eva share 5A/Blue.')}
    <h2>Trace an output, not just a row count</h2><p>For a paper question, write the correct column headings, each selected value, duplicate handling and the requested order. <code>DISTINCT name, house</code> removes duplicate name–house pairs, not every repeated house value independently. A WHERE condition can use a column that is not selected.</p>
    ${exercise('Predict SELECT name FROM Student WHERE house = \'Red\' ORDER BY name DESC;','The only output column is name. The rows are Chloe, then Ada. It selects Red-house students and sorts their names descending.')}`,
    quiz:[q('Without ORDER BY, which order must the result use?', ['Primary-key order','Insertion order','No guaranteed order'],2,'Specify ORDER BY whenever the required result order matters.'),q('What does SELECT DISTINCT class, house remove?', ['Duplicate class–house pairs','Every repeated class regardless of house','All rows with repeated names'],0,'DISTINCT applies to the entire selected row.')]
  },
  {
    id:'conditions',title:'Conditions, patterns & NULL',group:'SQL',scope:'Compulsory + elective',
    heading:'Translate the wording <em>into a condition.</em>',
    intro:'Comparison and logical operators turn a question into a filter. Decide the boundary cases, the grouping of conditions and how missing values should behave.',
    tags:['AND / OR / NOT','IN','BETWEEN','LIKE'],
    body:`${table(['Operator','Meaning','Example'],[['=, <>, <, <=, >, >=','Equality, inequality and comparisons.','mark >= 80'],['AND','Both conditions are true.','class = \'5A\' AND house = \'Blue\''],['OR','At least one condition is true.','house = \'Red\' OR house = \'Blue\''],['NOT','Negates a condition; unknown remains unknown.','NOT (class = \'5A\')'],['IN','Matches one member of a set.','course_id IN (\'ICT\', \'BIO\')'],['BETWEEN … AND …','Includes both endpoints.','mark BETWEEN 60 AND 80'],['LIKE','Matches a string pattern. % = zero or more characters; _ = exactly one character.','name LIKE \'A%\''],['IS NULL / IS NOT NULL','Tests missingness.','mark IS NOT NULL']])}
    ${sql("SELECT student_id, course_id, mark\nFROM Enrollment\nWHERE course_id IN ('ICT', 'BIO')\n  AND mark BETWEEN 60 AND 90\nORDER BY course_id, mark DESC;",'60 and 90 are included. A NULL mark does not satisfy BETWEEN.')}
    <h2>Precedence and parentheses</h2>
    <p>For Boolean operators, NOT binds before AND, and AND before OR. Translate “class 5A students in either Red or Blue house” as <code>class = '5A' AND (house = 'Red' OR house = 'Blue')</code>. Without parentheses, <code>class = '5A' AND house = 'Red' OR house = 'Blue'</code> includes all Blue-house students, even outside class 5A.</p>
    ${sql("SELECT name\nFROM Student\nWHERE class = '5A'\n  AND (house = 'Red' OR house = 'Blue')\nORDER BY name;",'Ada, Ben, Eva. Use parentheses to make the intended grouping explicit.')}
    <h2>Pattern matching</h2>
    ${table(['Pattern','Matches','Does not match'],[["'A%'",'Ada, Andrew, A','Ben'],["'_e%'",'Ben, Felix','Ada'],["'___'",'Ada, Ben, Eva','Chloe'],["'%a'",'Ada, Eva','Daniel']])}
    <p>Case sensitivity depends on the DBMS and collation; SQLite’s default LIKE is case-insensitive for basic ASCII characters. If matching case matters, specify the intended rules. Ordinary equality is clearer than LIKE when no pattern is needed.</p>
    ${sql("SELECT name, email\nFROM Student\nWHERE name LIKE '_e%' OR email IS NULL\nORDER BY name;",'Ben, Eva and Felix: Ben and Felix match the pattern; Eva and Felix have missing emails.')}
    <h2>Three-valued logic</h2>
    <p><code>mark &lt; 50</code> and <code>NOT (mark &gt;= 50)</code> both exclude a NULL mark. If the requirement is “failed or not yet recorded”, write <code>mark &lt; 50 OR mark IS NULL</code>. Avoid <code>NOT IN</code> over a subquery that may return NULL: a non-match can become unknown. Filter out NULLs or use a suitable existence test.</p>
    ${exercise('Select names with exactly three characters, ordered alphabetically. Give SQL and the output.',`${sql("SELECT name FROM Student\nWHERE name LIKE '___'\nORDER BY name;",'',false)}<p>Ada, Ben, Eva.</p>`)}`,
    quiz:[q('BETWEEN 60 AND 80 includes which values?', ['60 and 80','Neither endpoint','60 only'],0,'Both endpoints are included.'),q('LIKE \'_e%\' means…', ['Starts with e','The second character is e','Ends with e'],1,'The underscore matches exactly one initial character, e is the second, and % matches the rest.')]
  },
  {
    id:'functions',title:'Expressions & built-in functions',group:'SQL',scope:'Elective',
    heading:'Calculate a value, <em>keep its meaning.</em>',
    intro:'Scalar functions transform a value in each row. Aggregate functions combine values across rows. Know the inputs, the output and what happens to NULL.',
    tags:['Arithmetic','String functions','Aggregate functions','Dialect differences'],
    body:`<h2>Arithmetic and scalar functions</h2>
    ${sql("SELECT title, fee,\n       ROUND(fee * 0.9, 2) AS discounted_fee\nFROM Course\nORDER BY course_id;",'Multiplication takes precedence over addition; parentheses override precedence. These computed values do not change Course.fee.')}
    ${table(['Function / expression','Purpose','Lab example'],[['UPPER(text) / LOWER(text)','Change letter case.','UPPER(name)'],['LENGTH(text)','Count characters in the string.','LENGTH(name)'],['SUBSTR(text, start, length)','Extract a substring; positions start at 1.','SUBSTR(name, 1, 2)'],['TRIM(text)','Remove leading/trailing spaces.','TRIM(\' Ada \')'],['||','Concatenate strings in SQLite.','name || \' / \' || class'],['ROUND(number, digits)','Round a number.','ROUND(81.25, 1)'],['COALESCE(a, b, …)','Return the first non-NULL argument.','COALESCE(email, \'Not supplied\')']])}
    ${sql("SELECT UPPER(name) AS upper_name,\n       SUBSTR(name, 1, 2) AS initials,\n       name || ' / ' || class AS label,\n       COALESCE(email, 'Not supplied') AS contact\nFROM Student\nORDER BY student_id;")}
    ${note('Learn the operation, then check the dialect.','Some DBMSs use SUBSTRING instead of SUBSTR, CHAR_LENGTH instead of LENGTH, and CONCAT(...) instead of ||. Date functions and string concatenation differ. The curriculum specifies simple string functions without naming one universal dialect. Exam questions may supply function syntax; follow it.')}
    <h2>Aggregate functions</h2>
    ${table(['Function','Meaning','NULL behaviour'],[['COUNT(*)','Count all rows.','Includes rows containing NULL.'],['COUNT(mark)','Count recorded marks.','Ignores NULL marks.'],['COUNT(DISTINCT course_id)','Count distinct non-NULL values.','Ignores NULL and duplicates.'],['SUM(mark)','Sum recorded marks.','Ignores NULL.'],['AVG(mark)','Sum of non-NULL values ÷ count of non-NULL values.','A missing mark is not a zero.'],['MIN(mark) / MAX(mark)','Smallest / largest recorded value.','Ignores NULL.']])}
    ${sql("SELECT COUNT(*) AS enrolments,\n       COUNT(mark) AS recorded_marks,\n       SUM(mark) AS total,\n       ROUND(AVG(mark), 2) AS average,\n       MIN(mark) AS lowest,\n       MAX(mark) AS highest\nFROM Enrollment\nWHERE course_id = 'ICT';",'4 enrolments; 3 recorded marks; total 243; average 81; lowest 60; highest 95.')}
    <p>With no matching rows and no GROUP BY, COUNT returns 0; SUM, AVG, MIN and MAX return NULL. With GROUP BY, an absent group produces no row. Replacing missing marks with zero changes the question: <code>AVG(COALESCE(mark, 0))</code> treats unrecorded results as zero. In SQLite, <code>5 / 2</code> is integer division; use <code>5.0 / 2</code> for 2.5.</p>
    ${exercise('Explain why COUNT(*) and COUNT(mark) differ for ICT and why AVG(mark) is 81 rather than 60.75.','There are four ICT enrolments, but Eva’s mark is NULL. COUNT(mark) counts only three values. AVG(mark) is (88 + 60 + 95) / 3 = 81. Dividing by four would incorrectly treat the missing mark as zero.')}`,
    quiz:[q('Which counts every selected row?', ['COUNT(mark)','COUNT(*)','AVG(mark)'],1,'COUNT(*) counts rows regardless of NULLs.'),q('What does SUBSTR(\'Chloe\', 2, 3) return in the lab?', ['Chl','hlo','loe'],1,'Position 2 is h; take the next three characters: hlo.')]
  },
  {
    id:'grouping',title:'GROUP BY & HAVING',group:'SQL',scope:'Elective',
    heading:'Filter rows first. <em>Then compare groups.</em>',
    intro:'GROUP BY makes one group for each distinct key combination. Aggregate within those groups. WHERE filters individual rows; HAVING filters the resulting groups.',
    tags:['Group keys','WHERE vs HAVING','COUNT / AVG','Query order'],
    body:`${sql("SELECT course_id, COUNT(mark) AS marked,\n       ROUND(AVG(mark), 2) AS average\nFROM Enrollment\nWHERE mark IS NOT NULL\nGROUP BY course_id\nHAVING AVG(mark) >= 75\nORDER BY average DESC, course_id;",'ICT: 3 recorded marks, average 81. ART: 2 recorded marks, average 76. BIO’s average is about 73.33, so its group is excluded.')}
    <div class="flow"><span>FROM / JOIN</span><i>→</i><span>WHERE</span><i>→</i><span>GROUP BY</span><i>→</i><span>HAVING</span><i>→</i><span>SELECT / DISTINCT</span><i>→</i><span>ORDER BY</span></div>
    <p>This logical sequence explains how to reason about results. SQL is written in the order <code>SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY …</code>. Physical execution can differ.</p>
    <h2>Two different questions</h2>
    ${sql("SELECT course_id, AVG(mark) AS average\nFROM Enrollment\nWHERE mark >= 80\nGROUP BY course_id;",'First remove marks below 80. The average is now calculated from only the high marks: ICT 91.5, BIO 90, ART 82.')}
    ${sql("SELECT course_id, AVG(mark) AS average\nFROM Enrollment\nGROUP BY course_id\nHAVING AVG(mark) >= 80;",'Average all recorded marks first. Only ICT reaches 80. This answers a different question.')}
    <h2>Choose valid output columns</h2><p>Every selected expression should be an aggregate or be determined by the group keys. For portable exam SQL, list each selected non-aggregate column in GROUP BY. <code>SELECT course_id, student_id, AVG(mark) … GROUP BY course_id</code> does not define which student ID represents a course. SQLite may accept it, but its permissiveness is not a reason to write an ambiguous answer.</p>
    ${sql("SELECT class, house, COUNT(*) AS students\nFROM Student\nGROUP BY class, house\nHAVING COUNT(*) >= 2\nORDER BY class, house;",'Two groups remain: 5A/Blue has Ben and Eva; 5B/Green has Daniel and Felix.')}
    ${exercise('Write a query returning courses with at least three enrolments, including enrolments without a recorded mark.',sql("SELECT course_id, COUNT(*) AS enrolments\nFROM Enrollment\nGROUP BY course_id\nHAVING COUNT(*) >= 3\nORDER BY course_id;",'BIO has 3, ICT has 4.',false))}`,
    quiz:[q('Which clause tests AVG(mark) > 80 for a course group?', ['WHERE','HAVING','ORDER BY'],1,'HAVING filters aggregate groups; WHERE filters input rows.'),q('How should you count enrolments including missing marks?', ['COUNT(mark)','COUNT(*)','SUM(mark)'],1,'Each enrolment is a row, even if mark is NULL.')]
  },
  {
    id:'joins',title:'Joining up to three tables',group:'SQL',scope:'Elective',
    heading:'Connect the rows, <em>without losing the meaning.</em>',
    intro:'A join combines rows using a relationship. Check the join keys, which unmatched rows should survive, and whether one input row can produce multiple output rows.',
    tags:['Equi-join','Natural join','Outer joins','Three-table queries'],
    body:`<h2>Equi-join / inner join</h2><p>An equi-join uses equality in its join condition. An inner join retains only matching combinations. Table aliases make long references clearer and resolve duplicate column names.</p>
    ${sql("SELECT s.name, e.course_id, e.mark\nFROM Student AS s\nINNER JOIN Enrollment AS e\n  ON s.student_id = e.student_id\nWHERE e.course_id = 'ICT'\nORDER BY s.name;",'Ada 88, Ben 60, Chloe 95, Eva NULL. A matching enrolment survives even when its mark is NULL.')}
    <p>The older comma form <code>FROM Student s, Enrollment e WHERE s.student_id = e.student_id</code> can express the same equi-join. Omitting the relationship condition produces a Cartesian product: 6 students × 9 enrolments = 54 combinations, mostly unrelated.</p>
    <h2>Natural join</h2>
    ${sql("SELECT name, course_id, mark\nFROM Student NATURAL JOIN Enrollment\nORDER BY student_id, course_id;",'The only shared column name is student_id, so it becomes the join key automatically.')}
    <p>NATURAL JOIN matches <em>all</em> same-named columns and returns one copy of each shared column. A later schema change can silently add an unintended join condition. Prefer explicit ON conditions when clarity matters; understand natural join when asked to trace it.</p>
    <h2>Outer joins keep unmatched rows</h2>
    ${table(['Join','Unmatched rows retained'],[['LEFT OUTER JOIN','Every left-side row; fill missing right-side columns with NULL.'],['RIGHT OUTER JOIN','Every right-side row; fill missing left-side columns with NULL.'],['FULL OUTER JOIN','Unmatched rows from both sides, plus all matches.']])}
    ${sql("SELECT s.name, e.course_id, e.mark\nFROM Student AS s\nLEFT JOIN Enrollment AS e\n  ON s.student_id = e.student_id\nORDER BY s.student_id, e.course_id;",'Felix appears once with NULL course_id and NULL mark. Ada appears twice because she has two matching enrolments.')}
    ${sql("SELECT s.name\nFROM Student AS s\nLEFT JOIN Enrollment AS e\n  ON s.student_id = e.student_id\nWHERE e.student_id IS NULL;",'Felix has no enrolment. Test the right-side key, not mark: Eva has a real enrolment whose mark is NULL.')}
    ${sql("SELECT s.name, e.mark\nFROM Student AS s\nLEFT JOIN Enrollment AS e\n  ON s.student_id = e.student_id\n AND e.course_id = 'ICT'\nORDER BY s.name;",'Every student remains. Putting e.course_id = \'ICT\' in WHERE instead removes students without an ICT match, because NULL is not equal to ICT.')}
    <h2>A three-table question</h2>
    ${sql("SELECT s.name, c.title, e.mark\nFROM Student AS s\nJOIN Enrollment AS e ON s.student_id = e.student_id\nJOIN Course AS c ON e.course_id = c.course_id\nWHERE e.mark >= 80\nORDER BY s.name, c.title;",'Ada / Information Technology / 88; Ben / Art / 82; Chloe / Biology / 90; Chloe / Information Technology / 95.')}
    <h2>Counting after an outer join</h2>
    ${sql("SELECT c.course_id, COUNT(e.student_id) AS enrolments\nFROM Course AS c\nLEFT JOIN Enrollment AS e ON c.course_id = e.course_id\nGROUP BY c.course_id\nORDER BY c.course_id;",'ART 2, BIO 3, ICT 4, MUS 0. COUNT(*) would incorrectly report 1 for Music, counting its unmatched placeholder row.')}
    <p>RIGHT and FULL OUTER JOIN work in the bundled SQLite version, but support varies between DBMSs. Reversing the table order turns a RIGHT join into an equivalent LEFT join. A full join is useful, for example, when comparing two independent lists and retaining entries unique to either list.</p>
    ${sql("SELECT c.course_id, e.student_id\nFROM Enrollment AS e\nRIGHT OUTER JOIN Course AS c ON e.course_id = c.course_id\nORDER BY c.course_id, e.student_id;",'All courses remain, including MUS without an enrolment.')}
    ${sql("SELECT a.id AS left_id, b.id AS right_id\nFROM (SELECT 1 AS id UNION ALL SELECT 2) AS a\nFULL OUTER JOIN (SELECT 2 AS id UNION ALL SELECT 3) AS b\n  ON a.id = b.id;",'Demonstration using two small derived lists: (1, NULL), (2, 2), (NULL, 3), with no guaranteed output order. UNION ALL here only constructs the example lists; it is an extension, not a separately claimed syllabus requirement.')}
    ${exercise('Why does SELECT DISTINCT s.name after a join risk combining two different students?','Two students can share a name. DISTINCT operates on the selected values and cannot preserve identity that was not selected. Select student_id as well if the requirement is one row per distinct student.')}`,
    quiz:[q('Which finds students with no enrolment after a LEFT join?', ['WHERE e.mark IS NULL','WHERE e.student_id IS NULL','WHERE s.name IS NULL'],1,'An unrecorded mark is not the same as a missing child row. The matching child key cannot be NULL.'),q('What is the result size of Student CROSS JOIN Enrollment here?', ['15','54','9'],1,'There are 6 × 9 possible pairs.')]
  },
  {
    id:'subqueries',title:'One-level subqueries',group:'SQL',scope:'Elective',
    heading:'Use one answer <em>inside another question.</em>',
    intro:'A subquery supplies a value or set of values to an outer query. Keep the nesting to one sub-level for this course’s required SQL scope.',
    tags:['Scalar subquery','IN subquery','NOT IN & NULL','Existence'],
    body:`<h2>A single value: compare with an average</h2>
    ${sql("SELECT student_id, mark\nFROM Enrollment\nWHERE course_id = 'ICT'\n  AND mark > (\n    SELECT AVG(mark)\n    FROM Enrollment\n    WHERE course_id = 'ICT'\n  )\nORDER BY mark DESC;",'The inner average is 81. The outer query returns Chloe (3, 95) and Ada (1, 88). A scalar comparison requires a single value; an average without GROUP BY provides one.')}
    <h2>A set of values: use IN</h2>
    ${sql("SELECT student_id, name\nFROM Student\nWHERE student_id IN (\n  SELECT student_id\n  FROM Enrollment\n  WHERE course_id = 'BIO' AND mark >= 80\n)\nORDER BY student_id;",'The inner query returns student_id 3. The outer query returns Chloe.')}
    <p>Do not use <code>= (SELECT …)</code> when the subquery can produce several rows. Choose IN for membership. Duplicate values in an IN subquery do not duplicate the outer rows; a join can produce several matches.</p>
    <h2>Absence, and the NULL trap</h2>
    ${sql("SELECT name\nFROM Student\nWHERE student_id NOT IN (\n  SELECT student_id FROM Enrollment\n)\nORDER BY name;",'Felix. This is safe here because Enrollment.student_id is NOT NULL.')}
    <p>In a different schema with nullable inner IDs, filter those values with <code>WHERE student_id IS NOT NULL</code>. A set containing NULL makes a non-matching NOT IN comparison unknown. An optional extension is <code>NOT EXISTS</code>, which tests whether a related row exists and avoids that specific trap:</p>
    ${sql("SELECT s.name\nFROM Student AS s\nWHERE NOT EXISTS (\n  SELECT 1 FROM Enrollment AS e\n  WHERE e.student_id = s.student_id\n);",'Felix. This is a one-level correlated subquery: it references the outer student. Understand the idea; deeper nesting is not needed.')}
    ${note('Check the scope of the average.','“Above the ICT average” is different from “ICT marks above the average of all courses”. Put the ICT condition inside the subquery as well as in the outer query when that is what the question requires.')}
    ${exercise('Find course titles whose fee is greater than the average course fee.',sql("SELECT title, fee\nFROM Course\nWHERE fee > (SELECT AVG(fee) FROM Course)\nORDER BY fee DESC;",'Average fee is 97.5. Biology (120) and Information Technology (100) qualify.',false))}`,
    quiz:[q('An inner query may return several IDs. Which operator fits membership?', ['=','IN','IS NULL'],1,'IN compares with a set of values.'),q('Why can NOT IN be problematic?', ['It always duplicates rows','The inner set may contain NULL','It cannot use numbers'],1,'A NULL in the inner set can turn a non-match into an unknown result.')]
  },
  {
    id:'structure',title:'Creating & changing structure',group:'SQL',scope:'Elective',
    heading:'Define the container, <em>then fill it.</em>',
    intro:'Data definition language (DDL) creates or changes database structures. Structure changes are different from updating values inside existing rows.',
    tags:['CREATE TABLE','ALTER TABLE','DROP TABLE','Constraints & indexes'],
    body:`${sql(`CREATE TABLE Club (
  club_id INTEGER NOT NULL PRIMARY KEY,
  club_name VARCHAR(40) NOT NULL UNIQUE,
  annual_fee DECIMAL(8,2) NOT NULL DEFAULT 0
    CHECK (annual_fee >= 0)
);
INSERT INTO Club (club_id, club_name) VALUES (1, 'Robotics');
SELECT * FROM Club;`,'annual_fee is 0 because it was omitted and the default was used. Reset the lab before repeating this CREATE.')}
    <h2>Changing a table</h2>
    ${sql("ALTER TABLE Student ADD COLUMN phone VARCHAR(20);\nSELECT student_id, name, phone FROM Student;",'The new nullable column contains NULL for existing rows.')}
    ${sql("ALTER TABLE Student RENAME COLUMN house TO house_name;\nSELECT name, house_name FROM Student;",'Changes a column name, not its values. Reset restores the original schema.')}
    <p><code>ALTER TABLE Student DROP COLUMN phone;</code> can remove an eligible column in the bundled SQLite. You must first create that column. SQLite only supports a limited set of direct alterations; columns used by keys or constraints can require rebuilding the table. MySQL-style examples may use <code>MODIFY</code> or <code>CHANGE</code> for data types; those are not SQLite commands.</p>
    ${sql('ALTER TABLE Student MODIFY name VARCHAR(60);','MySQL-style type/size change, shown for recognition only. Not runnable in this SQLite lab.',false)}
    ${table(['Command','Effect','Common confusion'],[['CREATE TABLE','Creates a table and its column/constraint definitions.','Does not add all the real records by itself.'],['ALTER TABLE','Changes the schema.','UPDATE changes values, not column definitions.'],['DROP TABLE','Removes the table and its data.','DELETE removes rows but leaves the table definition.'],['CREATE INDEX / DROP INDEX','Adds / removes an access structure.','An ordinary index does not make values unique.']])}
    ${sql('CREATE TABLE Scratch (id INTEGER PRIMARY KEY);\nINSERT INTO Scratch VALUES (1);\nDROP TABLE Scratch;','A DDL sequence in the local practice database. There is no result table because no SELECT is included.')}
    <p>DDL transaction behaviour differs across DBMSs; some commands implicitly commit in some systems. Do not assume every schema change is reversible by ROLLBACK in every dialect. The lab database is temporary, and Reset restores its original schema and data.</p>
    ${exercise('Design a Book table with a unique required book_id, a required title and a non-negative price.',sql('CREATE TABLE Book (\n  book_id INTEGER NOT NULL PRIMARY KEY,\n  title VARCHAR(120) NOT NULL,\n  price DECIMAL(8,2) NOT NULL CHECK (price >= 0)\n);','Types and lengths should reflect the stated requirements. ISBN is normally text because it is an identifier.',false))}`,
    quiz:[q('Which command changes a table’s structure?', ['UPDATE','ALTER TABLE','SELECT'],1,'ALTER TABLE changes the schema; UPDATE changes row values.'),q('Which removes the table definition?', ['DELETE FROM table_name','DROP TABLE table_name','SELECT *'],1,'DROP removes both the table and its records.')]
  },
  {
    id:'changes',title:'INSERT, UPDATE & DELETE',group:'SQL',scope:'Elective',
    heading:'Change the intended rows. <em>Keep the rest.</em>',
    intro:'Data manipulation language (DML) adds, updates or removes rows. Always identify the target, choose the fields and check constraints before making a change.',
    tags:['INSERT INTO','UPDATE … SET','DELETE FROM','Preview with SELECT'],
    body:`<h2>Add an explicit record</h2>
    ${sql("INSERT INTO Student\n  (student_id, name, class, house, email, join_date)\nVALUES\n  (7, 'Grace', '5A', 'Red', NULL, '2025-09-04');\nSELECT * FROM Student WHERE student_id = 7;",'The column list makes each supplied value’s purpose explicit. Strings and dates use single quotes; SQL NULL is unquoted.')}
    <h2>Update selected values</h2>
    ${sql("UPDATE Enrollment\nSET mark = 78\nWHERE student_id = 5 AND course_id = 'ICT';\nSELECT * FROM Enrollment WHERE student_id = 5;",'Only Eva’s ICT mark changes. Her ART mark remains 70. WHERE uses both parts of the composite key.')}
    ${sql("UPDATE Course\nSET fee = ROUND(fee * 1.05, 2)\nWHERE course_id IN ('ICT', 'BIO');\nSELECT * FROM Course ORDER BY course_id;",'The arithmetic uses each target row’s existing fee: ICT becomes 105 and BIO becomes 126. Repeating the statement applies another increase.')}
    <h2>Delete the right records</h2>
    ${sql("DELETE FROM Enrollment\nWHERE student_id = 2 AND course_id = 'ART';\nSELECT * FROM Enrollment WHERE student_id = 2;",'Ben’s ART enrolment is removed; his ICT enrolment remains.')}
    ${note('A missing WHERE changes the whole table.','UPDATE Course SET fee = 0 updates every course. DELETE FROM Enrollment removes every enrolment. Before changing data, run a SELECT with the same condition and check that it returns the intended targets. The lab allows these operations on its temporary database so you can observe their effects.')}
    <p>Constraints still apply. Inserting duplicate primary keys fails. A non-existent parent ID violates a foreign key. Deleting a referenced Student fails under the sample database’s restrictive rule. Remove child rows first when that is the intended business operation, or use a deliberately designed cascade policy.</p>
    <h2>Distinguish three operations</h2>
    ${table(['Goal','Correct command'],[['Remove one course’s enrolment rows','DELETE FROM Enrollment WHERE course_id = \'ART\';'],['Add an attribute to the schema','ALTER TABLE … ADD COLUMN …'],['Remove the table itself','DROP TABLE …']])}
    ${exercise('Record a mark of 92 for student 3 in BIO without changing any other result.',sql("UPDATE Enrollment SET mark = 92\nWHERE student_id = 3 AND course_id = 'BIO';",'Use both key fields. A condition only on student_id would also change that student’s ICT mark.',false))}`,
    quiz:[q('UPDATE Enrollment SET mark = 80 without WHERE does what?', ['Updates the first row','Updates every enrolment','Creates a new column'],1,'All rows are targets when no WHERE condition is supplied.'),q('How do you represent an unknown mark in an INSERT?', ["'NULL'",'NULL','0'],1,'NULL is the SQL marker; quoted NULL is ordinary text, and zero is a recorded value.')]
  },
  {
    id:'views',title:'Views, forms & reports',group:'SQL',scope:'Compulsory + elective',
    heading:'Present the same data <em>for different purposes.</em>',
    intro:'A view is a named query that behaves like a virtual table. A report formats selected information; a form helps people supply or edit data.',
    tags:['CREATE VIEW','Virtual tables','Data entry','Report design'],
    body:`${sql("CREATE VIEW ICTResults AS\nSELECT s.student_id, s.name, s.class, e.mark\nFROM Student AS s\nJOIN Enrollment AS e ON s.student_id = e.student_id\nWHERE e.course_id = 'ICT';\n\nSELECT name, mark\nFROM ICTResults\nWHERE mark >= 80\nORDER BY mark DESC;",'Chloe 95, Ada 88. The ordinary view stores its definition; querying it reads the current underlying records.')}
    <h2>Why create a view?</h2>
    <ul><li><strong>Simplify repeated queries:</strong> name a useful join or filter.</li><li><strong>Present relevant fields:</strong> a class-list view can omit contact information.</li><li><strong>Separate an interface from storage:</strong> consumers can query a stable view while internal design evolves.</li></ul>
    <p>A view does not automatically sort results; sort when selecting from it. An ordinary view is not a frozen backup. Updating the base table changes what the view returns. Whether a view can be updated depends on the DBMS and its definition. In this SQLite lab, ordinary views are read-only unless suitable INSTEAD OF triggers are defined; triggers are outside this lesson’s required scope.</p>
    ${sql('DROP VIEW IF EXISTS ICTResults;','Remove the named query. Student and Enrollment remain. IF EXISTS is a useful lab convenience, not a separately claimed examination requirement.')}
    <h2>Design a form that matches the data model</h2>
    <p>An enrolment form should offer a student lookup and a course lookup, then an optional mark field with clear validation feedback. Store the IDs, even if the interface shows names. Check the unique pair and allow only existing parents. Make empty/unrecorded different from zero. Use readable labels and suitable tab order.</p>
    <h2>Design a report for an audience</h2>
    <p>A teacher’s course report can include the course name, student names, marks, a clearly defined average, the number of recorded marks and the report date. Choose meaningful headings and sorting; show missing results as “Not recorded”, not 0. A public report should omit personal contact details. CSV export transfers query results; it is not a full database backup and cannot preserve every constraint, view and relationship.</p>
    ${note('Privacy needs permissions as well as a view.','A view that hides email does not protect email if the user can still read Student directly. Grant access to the appropriate view and restrict the underlying table in a DBMS that supports users and permissions. This local SQLite lab does not implement those account permissions.')}
    ${exercise('A teacher wants an ICT report showing only recorded marks, sorted from highest to lowest. State the filter, order and how the average should treat missing marks.','Filter course_id = \'ICT\' and mark IS NOT NULL. Sort by mark DESC, with name or student_id as a tie-breaker. AVG(mark) ignores unrecorded marks; label the denominator as the number of recorded marks, not all enrolments.')}`,
    quiz:[q('An ordinary view stores…', ['A permanently frozen copy of all result rows','A query definition','A separate password for each row'],1,'It is normally a virtual table whose results reflect the underlying data.'),q('Does hiding email in a view alone guarantee privacy?', ['Yes, always','No, direct table access must also be restricted','Only if rows are sorted'],1,'Users with access to Student can still retrieve its email field.')]
  },
  {
    id:'transactions',title:'Transactions & rollback',group:'Management',scope:'Elective',
    heading:'Treat related changes <em>as one unit.</em>',
    intro:'A transaction groups operations that should succeed together. COMMIT confirms the transaction. ROLLBACK cancels uncommitted changes so a failed or mistaken operation does not leave a partial result.',
    tags:['BEGIN','COMMIT','ROLLBACK','Recovery'],
    body:`<h2>Observe a rollback</h2>
    ${sql("BEGIN TRANSACTION;\nUPDATE Course SET fee = fee + 10 WHERE course_id = 'ICT';\nSELECT fee AS before_rollback FROM Course WHERE course_id = 'ICT';\nROLLBACK;\nSELECT fee AS after_rollback FROM Course WHERE course_id = 'ICT';",'On a fresh database, the first query returns 110; after ROLLBACK, the fee is 100 again.')}
    <h2>Confirm a change</h2>
    ${sql("BEGIN TRANSACTION;\nUPDATE Enrollment SET mark = 78\nWHERE student_id = 5 AND course_id = 'ICT';\nCOMMIT;\nSELECT mark FROM Enrollment\nWHERE student_id = 5 AND course_id = 'ICT';",'The lab keeps the committed mark 78 until Reset or a page reload. COMMIT confirms changes to this in-memory practice database; it does not save a database file to disk.')}
    <h2>A real reason for atomic changes</h2><p>Moving a student from one course to another involves removing the old enrolment and adding the new one. If the addition fails, the deletion should not stand alone. Wrap the operations in a transaction, detect errors and roll back on failure. Keep the transaction short to reduce contention in shared systems.</p>
    <div class="two-col"><div class="card"><h3>Rollback is not a backup</h3><p>Rollback reverses an active transaction’s uncommitted changes. It does not normally undo an already committed mistake.</p></div><div class="card"><h3>Restore is a recovery operation</h3><p>A backup can restore an earlier state after failure. Keep suitable copies and test restoration; exporting one report is insufficient.</p></div></div>
    <p>For context, ACID describes atomicity (all-or-nothing), consistency (preserve rules), isolation (coordinate concurrent work) and durability (committed changes survive failures in a persistent DBMS). The required focus here is the purpose of rollback; full locking theory and recovery algorithms are extensions.</p>
    ${note('A failed statement is not always a full rollback.','In SQLite, a constraint failure often aborts the statement while leaving the transaction open. Explicitly issue ROLLBACK after such an error, or Reset the lab. Do not assume the engine automatically reversed earlier successful statements.')}
    ${exercise('After COMMIT, a user notices a wrong mark. Can ROLLBACK normally reverse that transaction? Explain the next options.','No: it has already been confirmed. Correct the value with an authorised new transaction, or use a suitable backup/recovery process if broader restoration is required. Rollback is for uncommitted work.')}`,
    quiz:[q('Which command confirms a transaction?', ['ROLLBACK','COMMIT','ORDER BY'],1,'COMMIT confirms the transaction; ROLLBACK cancels uncommitted changes.'),q('A transaction is still open after a constraint error. What cancels its earlier uncommitted changes?', ['SELECT','ROLLBACK','CREATE VIEW'],1,'Explicit rollback reverses the uncommitted transaction.')]
  },
  {
    id:'security',title:'Access rights & privacy',group:'Management',scope:'Elective',
    heading:'Share what is needed. <em>Protect what is personal.</em>',
    intro:'Privacy concerns appropriate access and use of personal data. Security measures help enforce that access. Integrity concerns correct, valid data; availability concerns reliable access when needed.',
    tags:['Least privilege','Roles','GRANT / REVOKE','Backup & audit'],
    body:`<h2>Give permissions by responsibility</h2>
    ${table(['Role','Needs','Should not receive by default'],[['Student','Read their own results.','Other students’ contact details or permission to change marks.'],['Teacher','Read and update results for assigned classes/courses.','Unrestricted administration or unrelated sensitive records.'],['Office staff','Maintain relevant contact/enrolment details.','Permission to alter academic marks without a duty requiring it.'],['Database administrator','Manage structure, accounts and recovery.','Routine use or distribution of personal data unrelated to administration.']])}
    <p><strong>Least privilege</strong> means granting the minimum permissions needed. Authentication establishes identity; authorisation determines allowed actions. A shared account makes accountability difficult. Revoke access when responsibilities change and review permissions periodically.</p>
    <h2>Understand access-right commands</h2>
    ${sql('GRANT SELECT ON ICTResults TO teacher_role;\nREVOKE UPDATE ON Enrollment FROM student_role;','Illustrative server-DBMS syntax. User/role syntax varies. SQLite has no SQL GRANT/REVOKE user system, so these commands are not runnable in the lab.',false)}
    <p>A table-level SELECT grant can expose all rows. To enforce “own results only”, use correctly designed views or row-level access mechanisms in the chosen server DBMS and do not grant a bypass path. Merely hiding a button in the interface does not secure the underlying data.</p>
    <h2>Combine controls</h2>
    ${table(['Control','Purpose','Practical limit'],[['Permissions / roles','Restrict reading, inserting, updating, deleting and administration.','Need correct setup and periodic review.'],['Views / limited interfaces','Expose only relevant rows or columns.','Must also restrict access to base tables.'],['Encryption','Protect data in transit or at rest.','An authorised account may still read decrypted data.'],['Audit logs','Record access and changes for accountability.','Detective control; logs need protection and review.'],['Backups & restoration tests','Recover after loss or corruption.','Backup copies also contain sensitive data.'],['Data minimisation','Collect and retain what the purpose requires.','Requires thoughtful requirements and retention procedures.']])}
    <p>Use fictional data when learning. A database exported to a public page can reveal information even if the original application had restricted access. Check fields, recipients and storage when creating a report or export.</p>
    ${exercise('An office needs names and classes but not marks or email. Propose an access design.','Provide a view exposing only the required fields and grant the office role SELECT on that view. Restrict direct access to the full base tables and give update permissions only if required for the role. Review who can export and share the result.')}`,
    quiz:[q('What does least privilege mean?', ['Give all staff administrator access','Give only the access needed for the task','Remove every backup'],1,'Permissions should match responsibilities.'),q('What establishes who a user is?', ['Authentication','Authorisation','Normalisation'],0,'Authentication establishes identity; authorisation decides allowed actions.')]
  }
  ];
  window.ICT_CHALLENGES = [
    {id:'c1',title:'01 · A class list',task:'Return student_id and name for class 5A, sorted by name ascending.',answer:"SELECT student_id, name FROM Student WHERE class = '5A' ORDER BY name;",ordered:true,hint:'Choose two columns. Filter class with WHERE; use ORDER BY name.'},
    {id:'c2',title:'02 · Pattern matching',task:'Return name for students whose name has exactly three characters, sorted alphabetically.',answer:"SELECT name FROM Student WHERE name LIKE '___' ORDER BY name;",ordered:true,hint:'Each underscore matches one character.'},
    {id:'c3',title:'03 · Missing results',task:'Return student_id and course_id for enrolments with an unrecorded mark.',answer:'SELECT student_id, course_id FROM Enrollment WHERE mark IS NULL;',hint:'Missing is not zero. Use IS NULL.'},
    {id:'c4',title:'04 · A range with a boundary',task:'Return student_id, course_id and mark for ICT or BIO marks between 60 and 90 inclusive. Sort by course_id ascending, then mark descending.',answer:"SELECT student_id, course_id, mark FROM Enrollment WHERE course_id IN ('ICT','BIO') AND mark BETWEEN 60 AND 90 ORDER BY course_id, mark DESC;",ordered:true,hint:'IN chooses courses; BETWEEN includes both endpoints.'},
    {id:'c5',title:'05 · Aggregate carefully',task:'For ICT, return three columns: total enrolments, recorded marks, average recorded mark. One result row.',answer:"SELECT COUNT(*), COUNT(mark), AVG(mark) FROM Enrollment WHERE course_id = 'ICT';",hint:'COUNT(*) counts rows; COUNT(mark) and AVG(mark) ignore NULL.'},
    {id:'c6',title:'06 · Filter the groups',task:'Return course_id and average mark for courses whose average recorded mark is at least 75. Sort by average descending.',answer:'SELECT course_id, AVG(mark) FROM Enrollment GROUP BY course_id HAVING AVG(mark) >= 75 ORDER BY AVG(mark) DESC;',ordered:true,hint:'Group by course_id and use HAVING for the average test. Do not round this result.'},
    {id:'c7',title:'07 · Two tables',task:'Return name and mark for every ICT enrolment, including unrecorded marks. Sort by name ascending.',answer:"SELECT s.name, e.mark FROM Student s JOIN Enrollment e ON s.student_id = e.student_id WHERE e.course_id = 'ICT' ORDER BY s.name;",ordered:true,hint:'An inner join keeps matching enrolments even if mark is NULL.'},
    {id:'c8',title:'08 · Include the empty course',task:'Return course_id and number of enrolments for every course, including zero-enrolment courses. Sort by course_id.',answer:'SELECT c.course_id, COUNT(e.student_id) FROM Course c LEFT JOIN Enrollment e ON c.course_id = e.course_id GROUP BY c.course_id ORDER BY c.course_id;',ordered:true,hint:'Start with Course and LEFT JOIN. Count a child key, not COUNT(*).'},
    {id:'c9',title:'09 · No enrolment',task:'Return student_id and name for students with no enrolment.',answer:'SELECT s.student_id, s.name FROM Student s LEFT JOIN Enrollment e ON s.student_id = e.student_id WHERE e.student_id IS NULL;',hint:'A missing mark is not a missing enrolment. Test the joined child key or use NOT IN.'},
    {id:'c10',title:'10 · Three tables',task:'Return name, course title and mark for recorded marks at least 80. Sort by name ascending, then course title ascending.',answer:'SELECT s.name, c.title, e.mark FROM Student s JOIN Enrollment e ON s.student_id = e.student_id JOIN Course c ON e.course_id = c.course_id WHERE e.mark >= 80 ORDER BY s.name, c.title;',ordered:true,hint:'Join Student → Enrollment → Course. Filter the mark.'},
    {id:'c11',title:'11 · Above the average',task:'Return student_id and mark for ICT marks strictly above the ICT average. Sort by mark descending.',answer:"SELECT student_id, mark FROM Enrollment WHERE course_id = 'ICT' AND mark > (SELECT AVG(mark) FROM Enrollment WHERE course_id = 'ICT') ORDER BY mark DESC;",ordered:true,hint:'Use one scalar subquery with the ICT filter inside it.'},
    {id:'c12',title:'12 · Text transformations',task:'Return student_id, uppercase name and the first two characters of name for every student. Sort by student_id.',answer:'SELECT student_id, UPPER(name), SUBSTR(name,1,2) FROM Student ORDER BY student_id;',ordered:true,hint:'Use UPPER and SUBSTR. String positions start at 1.'}
  ];
})();
