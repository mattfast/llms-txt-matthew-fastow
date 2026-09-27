from __future__ import annotations

import tldextract
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import CurrentUser, get_current_user
from app.models.jobs import CrawlJob
from app.models.site import LlmsTxtVersion, Page, Site
from app.schemas.sites import (
    CrawlJobOut,
    LlmsTxtVersionOut,
    LlmsTxtVersionSummaryOut,
    SiteCreateRequest,
    SiteOut,
)
from app.services.merkle import MerkleTree
from app.workers.queue import get_queue
from app.workers.tasks import crawl_site_job

router = APIRouter(prefix="/sites", tags=["sites"])
settings = get_settings()


def _domain_of(url: str) -> str:
    ext = tldextract.extract(url)
    return ".".join(part for part in (ext.domain, ext.suffix) if part)


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
def create_site(
    body: SiteCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    if not user.profile:
        raise HTTPException(status_code=400, detail="User has no company profile yet")

    domain = _domain_of(str(body.url))
    existing = (
        db.query(Site)
        .filter(Site.company_id == user.profile.company_id, Site.domain == domain)
        .one_or_none()
    )
    if existing:
        return existing

    site = Site(
        company_id=user.profile.company_id,
        created_by=user.id,
        root_url=str(body.url),
        domain=domain,
        status="pending",
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    job = CrawlJob(site_id=site.id, job_type="initial")
    db.add(job)
    db.commit()
    get_queue().enqueue(
        crawl_site_job,
        site.id,
        job.id,
        job_timeout=settings.crawl_job_timeout_seconds,
    )

    return site


@router.get("", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    if not user.profile:
        return []
    return (
        db.query(Site)
        .filter(Site.company_id == user.profile.company_id)
        .order_by(Site.created_at.desc())
        .all()
    )


@router.get("/{site_id}", response_model=SiteOut)
def get_site(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    site = _get_owned_site(db, site_id, user)
    return site


@router.get("/{site_id}/jobs", response_model=list[CrawlJobOut])
def list_jobs(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    _get_owned_site(db, site_id, user)
    return (
        db.query(CrawlJob)
        .filter(CrawlJob.site_id == site_id)
        .order_by(CrawlJob.started_at.desc())
        .limit(20)
        .all()
    )


@router.post("/{site_id}/recheck", response_model=CrawlJobOut, status_code=status.HTTP_202_ACCEPTED)
def trigger_recheck(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    site = _get_owned_site(db, site_id, user)
    job = CrawlJob(site_id=site.id, job_type="recheck")
    db.add(job)
    db.commit()
    db.refresh(job)
    get_queue().enqueue(
        crawl_site_job,
        site.id,
        job.id,
        job_timeout=settings.crawl_job_timeout_seconds,
    )
    return job


@router.get("/{site_id}/versions", response_model=list[LlmsTxtVersionSummaryOut])
def list_versions(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    _get_owned_site(db, site_id, user)
    return (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .all()
    )


@router.get("/{site_id}/versions/latest", response_model=LlmsTxtVersionOut)
def latest_version(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    _get_owned_site(db, site_id, user)
    version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="No llms.txt generated yet")
    return version


@router.get("/{site_id}/versions/{version_id}", response_model=LlmsTxtVersionOut)
def get_version(
    site_id: str, version_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)
):
    _get_owned_site(db, site_id, user)
    version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id, LlmsTxtVersion.id == version_id)
        .one_or_none()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@router.get("/{site_id}/llms.txt")
def download_llms_txt(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    _get_owned_site(db, site_id, user)
    version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="No llms.txt generated yet")
    return Response(content=version.content, media_type="text/plain")


@router.get("/{site_id}/llms-full.txt")
def download_llms_full_txt(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    _get_owned_site(db, site_id, user)
    version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="No llms.txt generated yet")
    return Response(content=version.full_content, media_type="text/plain")


@router.get("/{site_id}/merkle-tree")
def get_merkle_tree(site_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """Powers the live Merkle tree visualization: nodes colored by which subtrees changed
    in the most recent crawl job."""
    site = _get_owned_site(db, site_id, user)
    pages = db.query(Page).filter(Page.site_id == site_id).all()
    tree = MerkleTree({p.path: p.content_hash for p in pages})

    latest_version = (
        db.query(LlmsTxtVersion)
        .filter(LlmsTxtVersion.site_id == site_id)
        .order_by(LlmsTxtVersion.version_number.desc())
        .first()
    )
    changed_paths = set(latest_version.changed_paths) if latest_version else set()

    tree_dict = tree.root.to_dict()
    _mark_changed(tree_dict, changed_paths)
    return {"root_hash": tree.root_hash, "tree": tree_dict, "changed_paths": sorted(changed_paths)}


def _mark_changed(node: dict, changed_paths: set[str]) -> None:
    node["changed"] = node["path"] in changed_paths
    for child in node["children"]:
        _mark_changed(child, changed_paths)


def _get_owned_site(db: Session, site_id: str, user: CurrentUser) -> Site:
    site = db.get(Site, site_id)
    if not site or not user.profile or site.company_id != user.profile.company_id:
        raise HTTPException(status_code=404, detail="Site not found")
    return site
