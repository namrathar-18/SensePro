.PHONY: install test lint api enroll
install:
	cd backend && pip install -e ".[dev]"
test:
	cd backend && python -m pytest -q
lint:
	cd backend && ruff check . && ruff format --check .
api:
	cd backend && uvicorn app.main:app --reload --port 8000
enroll:
	cd backend && sensepro-enroll --student-id $(ID) --video $(VIDEO) --out enrollments.json
