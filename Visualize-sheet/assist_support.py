"""Page-scoped, persistent assistance planning and progress summaries."""
from collections import defaultdict


def page_plan(regions, measure_count):
    by_page=defaultdict(set); owners=defaultdict(set)
    for region in regions:
        index,page=region['index'],region['page']
        by_page[page].add(index);owners[index].add(page)
    if set(owners)!=set(range(measure_count)) or any(len(pages)!=1 for pages in owners.values()):
        raise ValueError('小节与 PDF 页面无法完整且唯一对应，自动核查未启动；可手动选择范围。')
    result=[]
    for page,indices in sorted(by_page.items()):
        start,end=min(indices),max(indices)
        if indices!=set(range(start,end+1)):raise ValueError('页面内小节索引不连续，自动核查未启动。')
        result.append({'page':page,'start':start,'end':end})
    return result


def progress(plan,jobs):
    pages=[];done=0;differences=0;comparable=0
    for item in plan.get('pages',[]):
        job=jobs.get(item.get('job_id'));state=job['state'] if job else 'missing' if item.get('job_id')else 'pending'
        page={**item,'state':state}
        if job:
            page['message']=job.get('message','')
            report=job.get('comparison')
            if report:
                page.update(comparable=report.get('comparable',False),agreement=report.get('agreement'),differing_measures=report.get('differing_measures'))
                if report.get('comparable'):comparable+=1;differences+=report.get('differing_measures',0)
        if state=='done':done+=1
        pages.append(page)
    states={p['state']for p in pages}
    state='done' if pages and done==len(pages) else 'running' if states&{'running','queued','cancelling'} else 'stopped' if states&{'error','cancelled','missing'} else plan.get('state','pending')
    return {**plan,'state':state,'pages':pages,'completed_pages':done,'total_pages':len(pages),'comparable_pages':comparable,'differing_measures':differences,'accuracy':None}
