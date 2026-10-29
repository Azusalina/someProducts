// Test-only subprocess. Never selected by the production HTTP interface.
import {writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
let input='';for await(const chunk of process.stdin)input+=chunk;
const options=JSON.parse(input);
if(options.url.includes('/999/')){setInterval(()=>{},1000);}
else if(options.url.includes('/888/')){console.log(JSON.stringify({type:'error',message:'Fixture exporter failed.'}));process.exitCode=1;}
else{
 console.log(JSON.stringify({type:'progress',message:'Page 1/2'}));
 const pdf=await PDFDocument.create();for(let i=1;i<=2;i++)pdf.addPage([400,600]).drawText(`Fixture page ${i}`,{x:32,y:500,size:20});
 await writeFile(options.output,await pdf.save());
 console.log(JSON.stringify({type:'complete',pages:2}));
}
