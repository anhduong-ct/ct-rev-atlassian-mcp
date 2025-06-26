import { parseSprintFile, getAssignmentsForEngineer } from '../sprint-parser';

describe('Sprint Planning Parser', () => {
  describe('Main Section Detection', () => {
    test('should correctly identify all main sections', () => {
      const content = `
        <p><code>TO BE RELEASED:</code></p>
        <ol>...</ol>
        <p><code>CONTINUE FROM LAST SPRINT:</code></p>
        <ol>...</ol>
        <p><code>NEW FOR NEXT SPRINT:</code></p>
        <ol>...</ol>
        <h3>Architecture Review</h3>
        <h3>Techdebt</h3>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('sections');
      expect(result.data.sections).toContain('TO BE RELEASED');
      expect(result.data.sections).toContain('CONTINUE FROM LAST SPRINT');
      expect(result.data.sections).toContain('NEW FOR NEXT SPRINT');
      expect(result.data.sections).toContain('Techdebt');
    });
  });

  describe('Standard Assignment Format', () => {
    test('should parse BE PIC with app platforms format', () => {
      const content = `
        <p>[Payment] Repayment - Dong Tot eContract orders <a href="...">CPPF-1245</a></p>
        <ol>
          <li><p><a href="...">CRE-10660</a>: TrangPIC + Web.AnhL + Android + iOS, update new DoS + TDoS, DoU ??!!</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1245',
        creId: 'CRE-10660',
        assignees: [
          { name: 'Trang', role: 'PIC' },
          { name: 'AnhL', role: 'Support', platform: 'Web' }
        ],
        platforms: ['Android', 'iOS'],
        status: {
          needsUpdate: true,
          missingInfo: ['DoS', 'TDoS', 'DoU']
        }
      });
    });

    test('should parse BE PIC with guide format', () => {
      const content = `
        <p>[Invoice] Issue promotion invoice for orders contain services with pricer segmentation <a href="...">CPPF-1434</a></p>
        <ol>
          <li><p>CRE-???: NhuPIC (guide from Kun)</p></li>
          <li><p>PM: provide the scope ??!!</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1434',
        creId: null,
        assignees: [
          { name: 'Nhu', role: 'PIC' },
          { name: 'Kun', role: 'Guide' }
        ],
        status: {
          needsUpdate: true,
          missingInfo: ['ticket', 'scope']
        }
      });
    });

    test('should parse web PIC with BE support format', () => {
      const content = `
        <p>[Ad Optimization] Service Recommendation section - Allow to view all ads <a href="...">CPPF-1428</a></p>
        <ol>
          <li><p><a href="...">CRE-11290</a>: AnhD.PIC + iOS + Android + BE.Viet → @Viet: confident (SP: 15) (*)</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1428',
        creId: 'CRE-11290',
        assignees: [
          { name: 'AnhD', role: 'PIC' },
          { name: 'Viet', role: 'Support', platform: 'BE', confident: true, storyPoints: 15, priority: 'high' }
        ],
        platforms: ['iOS', 'Android']
      });
    });
    
    test('should parse Android engineer (Hung) as PIC format', () => {
      const content = `
        <p>[Dong Tot eContract][App] eContract details page - allow editing customer info <a href="...">CPPF-1427</a></p>
        <ol>
          <li><p><a href="...">CRE-11279</a>: HungPIC + Android</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1427',
        creId: 'CRE-11279',
        assignees: [
          { name: 'Hung', role: 'PIC', platform: 'Android' }
        ]
      });
    });
    
    test('should parse iOS engineer (Hai) as PIC format', () => {
      const content = `
        <p>[My Rewards][iOS] Onflow - Content Card to redeem <a href="...">CPPF-1407</a></p>
        <ol>
          <li><p><a href="...">CRE-11074</a>: HaiPIC</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1407',
        creId: 'CRE-11074',
        assignees: [
          { name: 'Hai', role: 'PIC', platform: 'iOS' }
        ]
      });
    });

    test('should parse platform implies engineer assignment', () => {
      const content = `
        <p>[Revamp UI] - HomePage <a href="...">CPPF-1435</a></p>
        <ol>
          <li><p><a href="...">CRE-11326</a>: HaiPIC + Android + Web (AnhD+AnhL)</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1435',
        creId: 'CRE-11326',
        assignees: [
          { name: 'Hai', role: 'PIC', platform: 'iOS' },
          { name: 'Hung', role: 'Support', platform: 'Android' }, // Android implies Hung
          { name: 'AnhD', role: 'Support', platform: 'Web' },
          { name: 'AnhL', role: 'Support', platform: 'Web' }
        ]
      });
    });
  });

  describe('Special Assignment Formats', () => {
    test('should parse multiple web developers in parentheses', () => {
      const content = `
        <p>[Revamp UI] - HomePage</p>
        <ol>
          <li><p><a href="...">CRE-11326</a>: HaiPIC + Android + Web (AnhD+AnhL)</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment.assignees).toEqual(expect.arrayContaining([
        { name: 'Hai', role: 'PIC' },
        { name: 'Hung', role: 'Support', platform: 'Android' },
        { name: 'AnhD', role: 'Support', platform: 'Web' },
        { name: 'AnhL', role: 'Support', platform: 'Web' }
      ]));
    });

    test('should parse techdebt format', () => {
      const content = `
        <h3>Techdebt</h3>
        <ol>
          <li><p><a href="...">CRE-10802</a>: [Web][Techdebt] Refactor legacy payment dashboard. AnhD.PIC → update new DoS/DoU/DoP</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        creId: 'CRE-10802',
        section: 'Techdebt',
        assignees: [{ name: 'AnhD', role: 'PIC' }],
        status: { needsUpdate: true, missingInfo: ['DoS', 'DoU', 'DoP'] }
      });
    });
  });

  describe('Status and Metadata', () => {
    test('should detect deleted/cancelled items', () => {
      const content = `
        <p><del>[Revamp UI] - Adlisting + AdView for PTY/Job/VEH/GDS</del></p>
        <ol>
          <li><p><del>CRE-???: HungPIC + iOS + Web (AnhD+AnhL)</del></p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment.status.deleted).toBe(true);
    });

    test('should parse confidence and story points', () => {
      const content = `
        <p>[Ad Optimization] Service Recommendation section <a href="...">CPPF-1428</a></p>
        <ol>
          <li><p><a href="...">CRE-11290</a>: AnhD.PIC + BE.Viet → @Viet: confident (SP: 15) (*)</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment.assignees.find(a => a.name === 'Viet')).toMatchObject({
        confident: true,
        storyPoints: 15,
      });
    });

    test('should parse dates and deadlines', () => {
      const content = `
        <p>[Project] Release on 29/05/2025</p>
        <ol>
          <li><p>CRE-1234: PersonPIC, TDoS: 21/05, DoU: 25/05, DoP: 28/05</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment.dates).toMatchObject({
        releaseDate: new Date('2025-05-29'),
        tdos: new Date('2025-05-21'),
        dou: new Date('2025-05-25'),
        dop: new Date('2025-05-28')
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing ticket IDs', () => {
      const content = `
        <p>[Virtual Account] Add account ID <a href="...">CPPF-1415</a></p>
        <ol>
          <li><p>CRE-???: Vu Hoang PIC, no ticket, TDoS ??!!</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignment = result.data.assignments[0];
      expect(assignment).toMatchObject({
        cppfId: 'CPPF-1415',
        creId: null,
        status: { 
          needsUpdate: true,
          missingInfo: ['ticket', 'TDoS']
        }
      });
    });

    test('should handle multiple tickets for same CPPF', () => {
      const content = `
        <p>[Ad Optimization] Multiple tasks <a href="...">CPPF-1420</a></p>
        <ol>
          <li><p><a href="...">CRE-11208</a>: VietPIC</p></li>
          <li><p><a href="...">CRE-11209</a>: VietPIC</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      const assignments = result.data.assignments.filter(a => a.cppfId === 'CPPF-1420');
      expect(assignments).toHaveLength(2);
      expect(assignments[0].creId).toBe('CRE-11208');
      expect(assignments[1].creId).toBe('CRE-11209');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed HTML content', () => {
      const content = `
        <p>Broken HTML content
        <ol>
          <li>Invalid assignment
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle missing required fields', () => {
      const content = `
        <p>[Project] No tickets or assignments</p>
        <ol>
          <li><p>Just some text</p></li>
        </ol>
      `;
      const result = parseSprintFile(content);
      expect(result.success).toBe(true);
      expect(result.data.assignments).toHaveLength(0);
      expect(result.warnings).toBeDefined();
    });
  });
});

describe('Sprint Parser', () => {
  describe('getAssignmentsForEngineer', () => {
    it('should handle empty content', () => {
      const result = getAssignmentsForEngineer('', 'Anh');
      expect(result).toEqual({
        asPIC: [],
        asSupport: [],
        techdebt: []
      });
    });

    it('should parse PIC assignments', () => {
      const content = `
TO BE RELEASED:
1. [Project] Feature CPPF-1234
  a. CRE-5678: AnhPIC + iOS
`;
      const result = getAssignmentsForEngineer(content, 'Anh');
      expect(result.asPIC).toHaveLength(1);
      expect(result.asPIC[0].cppfId).toBe('CPPF-1234');
      expect(result.asPIC[0].creId).toBe('CRE-5678');
    });

    it('should parse support assignments', () => {
      const content = `
NEW FOR NEXT SPRINT:
1. [Project] Feature CPPF-1234
  a. CRE-5678: HaiPIC + Web.Anh + iOS
`;
      const result = getAssignmentsForEngineer(content, 'Anh');
      expect(result.asSupport).toHaveLength(1);
      expect(result.asSupport[0].cppfId).toBe('CPPF-1234');
      expect(result.asSupport[0].creId).toBe('CRE-5678');
    });

    it('should parse techdebt assignments', () => {
      const content = `
Techdebt
1. CRE-1234: [Web][Techdebt] Description. Anh.PIC → update new DoS/DoU/DoP
`;
      const result = getAssignmentsForEngineer(content, 'Anh');
      expect(result.techdebt).toHaveLength(1);
      expect(result.techdebt[0].creId).toBe('CRE-1234');
    });

    it('should parse confidence info', () => {
      const content = `
NEW FOR NEXT SPRINT:
1. [Project] Feature CPPF-1234
  a. CRE-5678: AnhPIC → Anh: confident (SP: 12) (*)
`;
      const result = getAssignmentsForEngineer(content, 'Anh');
      expect(result.asPIC[0].confidenceInfo).toEqual({
        confident: true,
        storyPoints: 12
      });
    });
  });
});
