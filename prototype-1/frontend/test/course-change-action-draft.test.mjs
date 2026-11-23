import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {actionDraftKey,readActionDraft,saveActionDraft} from '../src/features/course-change/actionDraft.ts';
import {clearStudentDrafts,DRAFT_MAX_AGE} from '../src/features/course-change/draft.ts';
function storage(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const now=1000000000;const value={version:1,note:'ข้อความที่ยังไม่ส่ง',reason:'เหตุผลฉบับแก้ไข',baseReason:'เหตุผลเดิม',revision:3,updatedAt:now};
describe('unsent workflow action text',()=>{
 it('restores Thai notes and revised reasons in the same account, request and action',()=>{const s=storage(),key=actionDraftKey('student','request','resubmit');assert.equal(saveActionDraft(s,key,value),true);assert.deepEqual(readActionDraft(s,key,now),value);});
 it('does not leak a draft to another account, request or action',()=>{const s=storage();saveActionDraft(s,actionDraftKey('one','r','resubmit'),value);for(const key of [actionDraftKey('two','r','resubmit'),actionDraftKey('one','different','resubmit'),actionDraftKey('one','r','complete')])assert.equal(readActionDraft(s,key,now),null);});
 it('expires after 24 hours, rejecting future or invalid timestamps',()=>{for(const updatedAt of [now-DRAFT_MAX_AGE-1,now+1,'invalid']){const s=storage();s.setItem('key',JSON.stringify({...value,updatedAt}));assert.equal(readActionDraft(s,'key',now),null);}});
 it('does not retain an untouched form and clears explicitly after success',()=>{const s=storage();saveActionDraft(s,'key',{...value,note:'',reason:value.baseReason});assert.equal(s.length,0);saveActionDraft(s,'key',value);saveActionDraft(s,'key',null);assert.equal(readActionDraft(s,'key',now),null);});
 it('rejects corrupt and oversized drafts without crashing',()=>{const s=storage();for(const v of ['{bad',JSON.stringify({...value,note:'x'.repeat(1001)}),JSON.stringify({...value,revision:-1})]){s.setItem('key',v);assert.equal(readActionDraft(s,'key',now),null);}});
 it('clears new-action and batch drafts on logout while preserving unrelated storage',()=>{const s=storage();saveActionDraft(s,actionDraftKey('one','r','resubmit'),value);saveActionDraft(s,actionDraftKey('staff','batch:r1:r2','batch'),value);s.setItem('unrelated','keep');clearStudentDrafts(s);assert.equal(s.length,1);assert.equal(s.getItem('unrelated'),'keep');});
 it('reports storage write failures so the form can warn before closing',()=>{assert.equal(saveActionDraft({setItem(){throw new Error('full');},getItem(){return null;},removeItem(){}},'key',value),false);});
});
