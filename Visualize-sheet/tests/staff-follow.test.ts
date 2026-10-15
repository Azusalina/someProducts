// @vitest-environment jsdom
import {test,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {musicXMLToScore} from '../src/score';
import {staffAnchors,currentStaffAnchor,followStaff} from '../src/staff-follow';

test('staff target advances by note within a measure, not just by measure',()=>{
  const xml=readFileSync('public/demo.musicxml','utf8'), score=musicXMLToScore(xml), anchors=staffAnchors(xml);
  expect(currentStaffAnchor(score,anchors,.01,{left:true,right:true})).toEqual({measure:0,beat:0});
  expect(currentStaffAnchor(score,anchors,.7,{left:true,right:true})).toEqual({measure:0,beat:.25});
  expect(currentStaffAnchor(score,anchors,.01,{left:false,right:false})).toBeUndefined();
});
test('tied continuation moves to its printed measure and tuplets retain exact anchors',()=>{
  const xml=readFileSync('tests/fixtures/notations.musicxml','utf8'), score=musicXMLToScore(xml), anchors=staffAnchors(xml);
  expect(currentStaffAnchor(score,anchors,1.6,{left:true,right:true})).toEqual({measure:1,beat:0});
  expect(currentStaffAnchor(score,anchors,2.2,{left:true,right:true})?.beat).toBeCloseTo(1/3);
});
test('cursor follows notes, seeks backwards and scrolls only its own pane',()=>{
  let index=0;const positions=[{measure:0,beat:0},{measure:0,beat:.25},{measure:1,beat:0}];
  const element=document.createElement('img');element.getBoundingClientRect=()=>({top:500,bottom:540,left:20,right:40} as DOMRect);
  const pane=document.createElement('div');pane.getBoundingClientRect=()=>({top:0,bottom:200,left:0,right:400} as DOMRect);Object.defineProperty(pane,'clientHeight',{value:200});
  const cursor={get Iterator(){return {EndReached:index>=positions.length,CurrentMeasureIndex:positions[Math.min(index,2)].measure,CurrentRelativeInMeasureTimestamp:{RealValue:positions[Math.min(index,2)].beat}};},cursorElement:element,
    reset:vi.fn(()=>{index=0;}),next:vi.fn(()=>{index++;}),show:vi.fn(),hide:vi.fn()};
  followStaff(cursor,{measure:0,beat:.25},pane);expect(index).toBe(1);expect(pane.scrollTop).toBeGreaterThan(0);
  followStaff(cursor,{measure:0,beat:0},pane);expect(index).toBe(0);expect(cursor.reset).toHaveBeenCalledTimes(1);
  followStaff(cursor,undefined,pane);expect(cursor.hide).toHaveBeenCalled();
});

test('display and playback share the duration fallback for incomplete tuplet XML',()=>{
  const xml=readFileSync('tests/fixtures/notations.musicxml','utf8').replaceAll(/<duration>[\d.]+<\/duration>/g,'');
  const score=musicXMLToScore(xml), anchors=staffAnchors(xml);
  expect(currentStaffAnchor(score,anchors,2.2,{left:true,right:true})?.beat).toBeCloseTo(1/3);
});
