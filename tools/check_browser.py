#!/usr/bin/env python3
"""Current core rules, CSV/persistence and native 3D workshop regression checks."""
import argparse
import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_spatial_workshop import main as spatial_checks


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--url',default='http://127.0.0.1:8000')
    parser.add_argument('--output',default='/tmp/aerolab-checks')
    parser.add_argument('--screenshots',action='store_true')
    args=parser.parse_args();base=args.url.rstrip('/');output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    launch={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}
    with sync_playwright() as p:
        browser=p.chromium.launch(**launch)
        try:
            context=browser.new_context(accept_downloads=True)
            page=context.new_page();page.set_default_timeout(15000);errors=[];external=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base+'/') else (external.append(r.request.url),r.abort()))
            page.goto(base+'/tests/browser.html');page.locator('body[data-finished=true]').wait_for()
            report=page.locator('#report').inner_text();print(report,flush=True)
            assert page.locator('body').get_attribute('data-failed')=='0'
            (output/'test-results.txt').write_text(report)
            page.goto(base+'/')
            sample=page.evaluate("""async()=>{
                const {createState,buildResult}=await import('./src/domain/state.js');
                const {exportCSV}=await import('./src/storage/csv.js');
                return exportCSV([buildResult(createState({session:'QA 파일 회차',trainee:'001'}),{status:'abandoned',durationSeconds:10})]);
            }""")
            page.locator('[data-action=operations]').click(force=True)
            upload={'name':'sample.csv','mimeType':'text/csv','buffer':sample.encode('utf-8')}
            page.locator('#csv-file').set_input_files(upload);page.locator('[data-action=import-confirm]').click(force=True)
            assert page.locator('tbody tr').count()==1 and '001' in page.locator('tbody').inner_text()
            with page.expect_download() as download:page.locator('[data-action=export-all]').click(force=True)
            download.value.save_as(output/'downloaded-results.csv')
            page.locator('#csv-file').set_input_files(upload)
            assert '중복 1건' in page.locator('.import-preview').inner_text()
            page.locator('[data-action=import-cancel]').click(force=True)
            page.locator('#csv-file').set_input_files({'name':'broken.csv','mimeType':'text/csv','buffer':b'not,a,valid,csv'})
            page.locator('.feedback').filter(has_text='열 이름').wait_for()
            assert page.locator('tbody tr').count()==1
            page.reload();page.locator('[data-action=operations]').click(force=True);assert page.locator('tbody tr').count()==1
            with tempfile.TemporaryDirectory(prefix='aerolab-persistence-') as profile:
                for iteration in range(2):
                    persistent=p.chromium.launch_persistent_context(profile,**launch)
                    try:
                        check=persistent.new_page();check.goto(base+'/');check.locator('[data-action=operations]').click(force=True)
                        if iteration==0:
                            check.locator('#csv-file').set_input_files(upload);check.locator('[data-action=import-confirm]').click(force=True)
                        assert check.locator('tbody tr').count()==1
                    finally:persistent.close()
            assert not errors and not external,{'errors':errors,'external':external}
            (output/'regression-results.json').write_text(json.dumps({'coreRules':22,'csvUploadDownload':True,'duplicateImport':True,'malformedImport':True,'reloadPersistence':True,'browserRestartPersistence':True,'pageErrors':errors,'externalRequests':external},ensure_ascii=False,indent=2))
            print('PASS CSV 실제 입출력·중복·잘못된 파일·새로고침·브라우저 재실행 후 보존',flush=True)
        finally:browser.close()
    options=['--url',base,'--output',str(output/'spatial')]
    if args.screenshots:options.append('--screenshots')
    spatial_checks(options)


if __name__=='__main__':main()
