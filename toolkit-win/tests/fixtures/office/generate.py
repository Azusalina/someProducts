"""Reproducible, self-authored OOXML fixtures; Python standard library only."""
from pathlib import Path
import zipfile
ROOT=Path(__file__).resolve().parent

def save(name,files):
    with zipfile.ZipFile(ROOT/name,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for path,content in files.items():
            info=zipfile.ZipInfo(path,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,content)

save('document.docx',{
 '[Content_Types].xml':'''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>''',
 '_rels/.rels':'''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>''',
 'word/document.xml':'''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:rPr><w:b/><w:color w:val="235A8A"/><w:sz w:val="36"/></w:rPr><w:t>Office PDF conversion</w:t></w:r></w:p>
<w:p><w:r><w:t>Word document with a table and explicit page break.</w:t></w:r></w:p>
<w:p><w:r><w:t>中文文件測試</w:t></w:r></w:p>
<w:tbl><w:tblPr><w:tblW w:w="8000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="8"/><w:left w:val="single" w:sz="8"/><w:bottom w:val="single" w:sz="8"/><w:right w:val="single" w:sz="8"/><w:insideH w:val="single" w:sz="8"/><w:insideV w:val="single" w:sz="8"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amount</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Rent</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1250</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Second page</w:t></w:r></w:p><w:p><w:r><w:t>Original document remains unchanged.</w:t></w:r></w:p>
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:bottom="1440" w:left="1440" w:right="1440"/></w:sectPr>
</w:body></w:document>'''
})
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def text(ref,value,style=0):return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t>{value}</t></is></c>'
rows=['<row r="1">'+''.join(text(chr(65+i)+'1',('Wide worksheet' if i==0 else 'Rightmost' if i==7 else 'Column '+str(i)),1) for i in range(8))+'</row>']
for r in range(2,71):
    cells=text('A'+str(r),'Row '+str(r))
    cells+=''.join(f'<c r="{chr(65+c)}{r}"><v>{c*10}</v></c>' for c in range(1,7))
    cells+=f'<c r="H{r}"><f>SUM(B{r}:G{r})</f><v>210</v></c>'
    rows.append(f'<row r="{r}">{cells}</row>')
files={
 '[Content_Types].xml':f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in (1,2,3))+'</Types>',
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Wide" sheetId="1" r:id="r1"/><sheet name="Summary" sheetId="2" r:id="r2"/><sheet name="Hidden" sheetId="3" r:id="r3" state="hidden"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="r{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in (1,2,3))+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
 'xl/styles.xml':f'<styleSheet xmlns="{ns}"><fonts count="2"><font><sz val="11"/><name val="Liberation Sans"/></font><font><b/><sz val="11"/><name val="Liberation Sans"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="0" borderId="0" applyFont="1"/></cellXfs></styleSheet>',
 'xl/worksheets/sheet1.xml':f'<worksheet xmlns="{ns}"><cols><col min="1" max="8" width="20" customWidth="1"/></cols><sheetData>'+''.join(rows)+'</sheetData><pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" scale="100"/></worksheet>',
}
for i,label in [(2,'Second worksheet'),(3,'Hidden worksheet content')]:
    files[f'xl/worksheets/sheet{i}.xml']=f'<worksheet xmlns="{ns}"><cols><col min="1" max="1" width="36" customWidth="1"/></cols><sheetData><row r="1">{text("A1",label,1)}</row></sheetData></worksheet>'
save('workbook.xlsx',files)
