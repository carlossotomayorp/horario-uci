import os
import json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, Integer, Text, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert

# Cargar URL de la Nube, o usar base local si no existe
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///horario.db")
# Fix para URLs antiguas de Render o Heroku
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Schedule(Base):
    __tablename__ = "schedules"
    month_key = Column(String, primary_key=True, index=True)
    data_json = Column(Text)

class CheckIn(Base):
    __tablename__ = "checkins"
    id = Column(Integer, primary_key=True, index=True)
    month_key = Column(String, index=True)
    day = Column(Integer)
    area = Column(String)
    shift = Column(String)
    doctor_name = Column(String)
    __table_args__ = (UniqueConstraint('month_key', 'day', 'area', 'shift', 'doctor_name', name='_checkin_uc'),)

# Auto-crear base de datos
Base.metadata.create_all(bind=engine)

app = FastAPI()

# Pydantic Models
class ScheduleUpload(BaseModel):
    month_key: str
    data: dict

class CheckInAction(BaseModel):
    month_key: str
    day: int
    area: str
    shift: str
    doctor_name: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/months")
def get_months(db: Session = Depends(get_db)):
    rows = db.query(Schedule.month_key).all()
    return {"months": [r[0] for r in rows]}

@app.get("/api/schedule/{month_key}")
def get_schedule(month_key: str, db: Session = Depends(get_db)):
    row = db.query(Schedule).filter(Schedule.month_key == month_key).first()
    if not row:
        raise HTTPException(status_code=404, detail="Mes no encontrado")
        
    base_data = json.loads(row.data_json)
    
    checkins = db.query(CheckIn).filter(CheckIn.month_key == month_key).all()
    
    # Inyectar marcas de asistencia remota
    for ci in checkins:
        day_str = str(ci.day)
        if day_str in base_data:
            if ci.area in base_data[day_str] and ci.shift in base_data[day_str][ci.area]:
                for doc in base_data[day_str][ci.area][ci.shift]:
                    if doc['name'] == ci.doctor_name:
                        doc['attended'] = True

    return {"schedule": base_data}

@app.post("/api/schedule")
def upload_schedule(upload: ScheduleUpload, db: Session = Depends(get_db)):
    if "sqlite" in engine.dialect.name:
        stmt = sqlite_insert(Schedule).values(
            month_key=upload.month_key,
            data_json=json.dumps(upload.data)
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=['month_key'],
            set_=dict(data_json=stmt.excluded.data_json)
        )
        db.execute(stmt)
    else:
        stmt = pg_insert(Schedule).values(
            month_key=upload.month_key,
            data_json=json.dumps(upload.data)
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=['month_key'],
            set_=dict(data_json=stmt.excluded.data_json)
        )
        db.execute(stmt)
        
    db.commit()
    return {"status": "ok"}

@app.post("/api/checkin")
def register_checkin(action: CheckInAction, db: Session = Depends(get_db)):
    if "sqlite" in engine.dialect.name:
        stmt = sqlite_insert(CheckIn).values(
            month_key=action.month_key,
            day=action.day,
            area=action.area,
            shift=action.shift,
            doctor_name=action.doctor_name
        )
        stmt = stmt.on_conflict_do_nothing()
        db.execute(stmt)
    else:
        stmt = pg_insert(CheckIn).values(
            month_key=action.month_key,
            day=action.day,
            area=action.area,
            shift=action.shift,
            doctor_name=action.doctor_name
        )
        stmt = stmt.on_conflict_do_nothing()
        db.execute(stmt)
        
    db.commit()
    return {"status": "ok"}

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
