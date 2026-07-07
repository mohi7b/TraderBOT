from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from core.logic.US.US_macro_pipeline import USMacroPipeline

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"

pipeline = USMacroPipeline(data_root=DATA_ROOT)

app = FastAPI()

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

# اینجا پوشه‌ی style رو mount می‌کنیم
app.mount("/style", StaticFiles(directory=str(Path(__file__).parent / "style")), name="style")


@app.get("/")
def dashboard(request: Request):
    result = pipeline.run()
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "result": result
        }
    )
