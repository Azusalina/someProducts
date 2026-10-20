"""Whole-document pass: pages -> systems -> events with pitches, ottava, ties, measure numbers.

Page analysis is independent per page, so it runs on a process pool (all cores by default). Ties and accidentals
carry across systems/pages, so those steps run afterwards in reading order.
"""
import os
import multiprocessing
from concurrent.futures import ProcessPoolExecutor
import pymupdf
from .primitives import load_page
from .analyze import analyze_page
from .pitch import compute_pitches
from .marks import ottava_spans, apply_ottava, find_ties
from .measures import number_systems


def _analyze(args):
    path, pi = args
    doc = pymupdf.open(path)
    pg = load_page(doc, pi)
    systems, _ = analyze_page(pg)
    spans = ottava_spans(doc, pi, pg, systems)
    for sy in systems:
        sy.page = pi
        apply_ottava(sy, spans[sy.index])
    return pi, pg, systems


def parse_document(path, first=None, last=None, jobs=None):
    doc = pymupdf.open(path)
    n = len(doc)
    lo = (first or 1) - 1
    hi = last or n
    jobs = jobs or os.cpu_count() or 1
    work = [(path, pi) for pi in range(lo, hi)]
    if jobs > 1 and len(work) > 1 and "fork" in multiprocessing.get_all_start_methods():
        ctx = multiprocessing.get_context("fork")        # no re-import of the caller's __main__
        with ProcessPoolExecutor(max_workers=min(jobs, len(work)), mp_context=ctx) as ex:
            results = list(ex.map(_analyze, work))
    else:
        results = [_analyze(w) for w in work]
    pages, pending = [], []
    for pi, pg, systems in sorted(results, key=lambda r: r[0]):
        for sy in systems:
            pending = find_ties(pg, sy, pending)
            compute_pitches(sy)
        pages.append(systems)
    warnings = number_systems(doc, pages) if lo == 0 else []
    return doc, pages, warnings
