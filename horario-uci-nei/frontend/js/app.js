const app = {
  role: null,
  pendingRole: null,
  currentDay: 1,
  currentMonthKey: null,
  availableMonths: [],
  db: {}, 

  loadDB: async function() {
    try {
        const resp = await fetch('/api/months');
        const data = await resp.json();
        this.availableMonths = data.months || [];
        
        this.updateMonthSelector();
        
        if (this.availableMonths.length > 0) {
            this.currentMonthKey = this.availableMonths[this.availableMonths.length - 1]; 
            document.getElementById('month-selector').value = this.currentMonthKey;
            await this.fetchSchedule(this.currentMonthKey);
        } else {
            this.db = {};
            this.renderSchedule(); 
        }
    } catch(e) {
        console.error('Servidor desconectado. ¿Iniciaste uvicorn?', e);
    }
  },

  fetchSchedule: async function(monthKey) {
     if(!monthKey) return;
     try {
         const resp = await fetch(`/api/schedule/${encodeURIComponent(monthKey)}`);
         if(resp.ok) {
             const data = await resp.json();
             this.db[monthKey] = data.schedule;
         }
     } catch(e) {}
  },

  updateMonthSelector: function() {
    const selector = document.getElementById('month-selector');
    selector.innerHTML = '';
    
    if (this.availableMonths.length === 0) {
        let opt = document.createElement('option');
        opt.value = "";
        opt.text = "Sin horarios cargados";
        selector.appendChild(opt);
        return;
    }

    this.availableMonths.forEach(k => {
        let opt = document.createElement('option');
        opt.value = k;
        opt.text = k;
        selector.appendChild(opt);
    });
  },

  switchMonth: async function(monthKey) {
    if(!monthKey) return;
    this.currentMonthKey = monthKey;
    await this.fetchSchedule(monthKey);
    const realToday = new Date().getDate();
    this.selectDay(realToday <= 30 ? realToday : 1);
  },

  selectRoleStep: function(role) {
    this.pendingRole = role;
    document.getElementById('auth-step-1').style.display = 'none';
    
    const label = role === 'admin' ? '🔒 Acceso Administrador Global' : '⚕️ Acceso Panel Médico';
    document.getElementById('lbl-selected-role').innerText = label;
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-error').style.display = 'none';

    document.getElementById('auth-step-2').style.display = 'block';
    setTimeout(() => {
      document.getElementById('auth-password').focus();
    }, 50);
  },

  resetAuthStep: function() {
    this.pendingRole = null;
    document.getElementById('auth-step-2').style.display = 'none';
    document.getElementById('auth-step-1').style.display = 'block';
  },

  attemptLogin: function() {
    const role = this.pendingRole;
    if(!role) return;

    const pwdInput = document.getElementById('auth-password').value;
    const errBox = document.getElementById('auth-error');
    
    if (role === 'admin') {
      if (pwdInput !== 'NEI.94802431') {
        errBox.innerText = "Clave de administrador incorrecta.";
        errBox.style.display = 'block';
        return;
      }
    } else if (role === 'medico') {
      if (pwdInput !== 'sanjuan2026') {
        errBox.innerText = "Clave de médico incorrecta.";
        errBox.style.display = 'block';
        return;
      }
    }
    
    errBox.style.display = 'none';
    this.role = role;
    
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';

    const welcomeMsg = document.getElementById('welcome-msg');
    const adminReminder = document.getElementById('admin-reminder');

    if (role === 'admin') {
      welcomeMsg.innerText = "Dr Carlos Alberto Sotomayor Polar";
      document.getElementById('admin-tools').style.display = 'block'; 
      adminReminder.style.display = 'block';
    } else {
      welcomeMsg.innerText = "Panel Médico";
      document.getElementById('admin-tools').style.display = 'none';
      adminReminder.style.display = 'none';
    }

    this.renderDayPicker();
    this.loadDB(); // Async init with server
    this.setupExcelUpload();
  },

  logout: function() {
    this.role = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('auth-section').style.display = 'flex';
    this.resetAuthStep();
  },

  renderDayPicker: function() {
    const container = document.getElementById('day-picker');
    container.innerHTML = '';
    
    let shortName = "Mes";
    if (this.currentMonthKey) {
       shortName = this.currentMonthKey.substring(0,3).toUpperCase();
    }

    for (let d = 1; d <= 31; d++) {
      const btn = document.createElement('div');
      btn.className = `day-btn ${this.currentDay === d ? 'active' : ''}`;
      btn.onclick = () => this.selectDay(d);
      
      btn.innerHTML = `<span class="txt">${shortName}</span><span class="num">${d}</span>`;
      container.appendChild(btn);
    }
  },

  selectDay: function(day) {
    this.currentDay = day;
    
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.remove('active');
      if (parseInt(btn.querySelector('.num').innerText) === day) {
        btn.classList.add('active');
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });

    this.renderSchedule();
  },

  renderSchedule: function() {
    if (!this.currentMonthKey || !this.db[this.currentMonthKey]) {
        ['uci-morning', 'uci-afternoon', 'uci-night', 'uce-morning', 'uce-afternoon', 'uce-night'].forEach(id => {
            document.getElementById(id).innerHTML = '<span style="color:var(--text-secondary); font-size:0.9rem;">Sin asignación</span>';
        });
        return;
    }

    const data = this.db[this.currentMonthKey][this.currentDay];
    if (!data) return;

    const realToday = new Date().getDate();
    const canCheckIn = (this.currentDay === realToday);

    const renderList = (elementId, array, area, shift) => {
      const el = document.getElementById(elementId);
      if (!array || array.length === 0) {
        el.innerHTML = '<span style="color:var(--text-secondary); font-size:0.9rem;">Sin asignación</span>';
        return;
      }
      
      el.innerHTML = array.map((doc, idx) => {
        let actionHTML = '';
        if (doc.attended) {
            actionHTML = `<button class="checkin-btn marked">✅ Asistió</button>`;
        } else if (canCheckIn) {
            actionHTML = `<button class="checkin-btn" onclick="app.checkIn('${area}', '${shift}', ${idx})">Marcar Asistencia</button>`;
        }
        return `
            <div class="doc-pill">
                <div class="doc-info">${doc.name}</div>
                ${actionHTML}
            </div>
        `;
      }).join('');
    };

    renderList('uci-morning', data.uci.morning, 'uci', 'morning');
    renderList('uci-afternoon', data.uci.afternoon, 'uci', 'afternoon');
    renderList('uci-night', data.uci.night, 'uci', 'night');

    renderList('uce-morning', data.uce.morning, 'uce', 'morning');
    renderList('uce-afternoon', data.uce.afternoon, 'uce', 'afternoon');
    renderList('uce-night', data.uce.night, 'uce', 'night');
  },

  checkIn: async function(area, shift, idx) {
    if (!this.currentMonthKey) return;
    const dayData = this.db[this.currentMonthKey][this.currentDay];
    
    if (dayData && dayData[area] && dayData[area][shift]) {
        let docObj = dayData[area][shift][idx];
        
        try {
            const resp = await fetch('/api/checkin', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    month_key: this.currentMonthKey,
                    day: this.currentDay,
                    area: area,
                    shift: shift,
                    doctor_name: docObj.name
                })
            });
            if (resp.ok) {
                // Actualizar UI local optimista
                docObj.attended = true;
                this.renderSchedule();
            } else {
                alert("Error al marcar registro remoto.");
            }
        } catch(e) {
            alert("Red desconectada.");
        }
    }
  },

  setupExcelUpload: function() {
    const input = document.getElementById('fileUpload');
    if(!input || input.dataset.bound) return;
    
    input.dataset.bound = "true";

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target.result;
          const workbook = XLSX.read(data, {type: 'binary'});
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
          
          await this.parseExcelMatrix(json, file.name);
        } catch(err) {
          alert("Error procesando Excel: " + err.message);
        }
        input.value = '';
      };
      reader.readAsBinaryString(file);
    });
  },

  parseExcelMatrix: async function(json, filename) {
    let parts = filename.split('.');
    let rawStrName = parts.length > 0 ? parts[0] : "Mes Desconocido";
    let newMonthKey = rawStrName.trim().toUpperCase();

    let localLegend = {};
    json.forEach(row => {
      if(!row) return;
      let letterIndex = -1;
      let nameIndex = -1;
      row.forEach((cell, idx) => {
        if (typeof cell === 'string') {
          cell = cell.trim();
          if (cell.length === 1 && /[A-Z]/i.test(cell)) letterIndex = idx;
          if (cell.toUpperCase().includes('DR') || cell.toUpperCase().includes('DRA')) nameIndex = idx;
        }
      });
      if (letterIndex !== -1 && nameIndex !== -1 && letterIndex !== nameIndex) {
        localLegend[row[letterIndex].toUpperCase()] = row[nameIndex].trim();
      }
    });

    let builtMatrix = {};
    for (let i = 1; i <= 31; i++) {
        builtMatrix[i] = {
            uci: { morning: [], afternoon: [], night: [] },
            uce: { morning: [], afternoon: [], night: [] }
        };
    }

    let dayCols = {};
    let headerRowIndex = -1;

    for (let i=0; i<Math.min(20, json.length); i++) {
        const row = json[i];
        if(!row) continue;
        let foundDays = 0;
        row.forEach((cell, idx) => {
            let val = parseInt(cell);
            if (!isNaN(val) && val >= 1 && val <= 31) {
                foundDays++;
                dayCols[idx] = val;
            }
        });
        if (foundDays > 10) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        for(let d=1; d<=30; d++) dayCols[d] = d;
    }

    let currentArea = 'uci';
    let currentShift = 'morning';

    for (let i = headerRowIndex + 1; i < json.length; i++) {
        const row = json[i];
        if(!row) continue;
        
        let rowText = row.join(' ').toUpperCase();

        if (rowText.includes('CUIDADOS INTENSIVOS') || rowText.includes('UCI')) currentArea = 'uci';
        if (rowText.includes('CUIDADOS ESPECIALES') || rowText.includes('UCE')) currentArea = 'uce';

        if (rowText.includes('MAÑ') || rowText.includes('MANA')) currentShift = 'morning';
        if (rowText.includes('TARDE')) currentShift = 'afternoon';
        if (rowText.includes('NOCH')) currentShift = 'night';

        Object.keys(dayCols).forEach(colIdx => {
            const day = dayCols[colIdx];
            const cell = row[colIdx];
            
            if (cell && typeof cell === 'string') {
              let letter = cell.trim().toUpperCase();
              if (letter.length === 1 && localLegend[letter]) {
                let doctorName = localLegend[letter];
                
                if (!builtMatrix[day][currentArea][currentShift].some(d => d.name === doctorName)) {
                    builtMatrix[day][currentArea][currentShift].push({ name: doctorName, attended: false });
                }
              }
            }
        });
    }

    // Subir carga completa al Servidor Backend
    try {
        const bResp = await fetch('/api/schedule', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                month_key: newMonthKey,
                data: builtMatrix
            })
        });
        
        if (bResp.ok) {
            if (!this.availableMonths.includes(newMonthKey)) {
                this.availableMonths.push(newMonthKey);
            }
            this.db[newMonthKey] = builtMatrix;
            this.updateMonthSelector();
            document.getElementById('month-selector').value = newMonthKey;
            await this.switchMonth(newMonthKey);
            alert(`¡Horario de ${newMonthKey} subido con éxito al Servidor Remoto!`);
        } else {
            alert("Error remoto de escritura.");
        }
    } catch(e) {
        alert("Falla de API alojando en Python.");
    }
  },

  generateCalendar: function(areaKey) {
    if (!this.currentMonthKey || !this.db[this.currentMonthKey]) {
        alert("No hay horario en dicho mes.");
        return;
    }

    if(!window.jspdf) {
        alert("La librería PDF no ha cargado. Verifica la conexión a internet.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    
    const areaName = areaKey === 'uci' ? 'CUIDADOS INTENSIVOS' : 'CUIDADOS ESPECIALES';
    const mainColor = areaKey === 'uci' ? [0, 119, 182] : [46, 204, 113]; 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(mainColor[0], mainColor[1], mainColor[2]);
    doc.text(`NUEVA ESPERANZA INTENSIVA SAC - UCI SAN JUAN DE DIOS`, 148, 15, { align: "center" });

    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text(`Horario Programación - ${this.currentMonthKey} - ${areaName}`, 148, 23, { align: "center" });

    const startX = 15;
    let startY = 32;
    const boxWidth = 38;
    const boxHeight = 25;

    doc.setFontSize(10);
    for(let d=1; d<=30; d++) { 
        let row = Math.floor((d - 1) / 7);
        let col = (d - 1) % 7;
        
        let x = startX + (col * boxWidth);
        let y = startY + (row * boxHeight);

        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, boxWidth, boxHeight);

        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 30, 30);
        doc.text(d.toString(), x + 2, y + 4);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        
        const formatNamesArr = (shiftData) => {
            if(!shiftData || shiftData.length===0) return '-';
            return shiftData.map(docObj => docObj.name).join(', ');
        };

        let areaData = this.db[this.currentMonthKey][d] ? this.db[this.currentMonthKey][d][areaKey] : {morning:[], afternoon:[], night:[]};
        
        let morningText = formatNamesArr(areaData.morning);
        let afternoonText = formatNamesArr(areaData.afternoon);
        let nightText = formatNamesArr(areaData.night);

        doc.setTextColor(0, 150, 200);
        doc.text(`M: ${morningText}`, x + 2, y + 10);
        
        doc.setTextColor(200, 100, 0);
        doc.text(`T: ${afternoonText}`, x + 2, y + 16);
        
        doc.setTextColor(120, 0, 150);
        doc.text(`N: ${nightText}`, x + 2, y + 22);
    } 

    const safeFile = `Horario_${areaKey.toUpperCase()}_${this.currentMonthKey.replace(' ', '')}.pdf`;
    doc.save(safeFile);
  },

  generateAttendanceReport: function() {
    if (!this.currentMonthKey || !this.db[this.currentMonthKey]) {
        alert("No hay horario en dicho mes.");
        return;
    }

    if(!window.jspdf || !window.jspdf.jsPDF) {
        alert("La librería jsPDF no ha cargado. Verifica la conexión a internet.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

    if(!doc.autoTable) {
        alert("El complemento autotable no se ha insertado correctamente. Recarga la página.");
        return;
    }

    let stats = {};
    let globalUCI = 0;
    let globalUCE = 0;
    let globalTotal = 0;

    for (let d = 1; d <= 31; d++) {
        let dayData = this.db[this.currentMonthKey][d];
        if(!dayData) continue;

        const countShifts = (shiftArray, area, multiplier) => {
            if(!shiftArray) return;
            shiftArray.forEach(docObj => {
                if(docObj.attended) {
                    if(!stats[docObj.name]) stats[docObj.name] = {uci:0, uce:0, total:0};
                    
                    let val = 1 * multiplier;
                    stats[docObj.name][area] += val;
                    stats[docObj.name].total += val;
                    
                    if(area === 'uci') globalUCI += val;
                    if(area === 'uce') globalUCE += val;
                    globalTotal += val;
                }
            });
        };

        countShifts(dayData.uci.morning, 'uci', 1);
        countShifts(dayData.uci.afternoon, 'uci', 1);
        countShifts(dayData.uci.night, 'uci', 2); 
        
        countShifts(dayData.uce.morning, 'uce', 1);
        countShifts(dayData.uce.afternoon, 'uce', 1);
        countShifts(dayData.uce.night, 'uce', 2); 
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 50, 100);
    doc.text(`NUEVA ESPERANZA INTENSIVA SAC`, 105, 15, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(0, 119, 182);
    doc.text(`UCI SAN JUAN DE DIOS - REPORTE DE ASISTENCIA`, 105, 22, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    doc.text(`Mes Evaluado: ${this.currentMonthKey}`, 14, 35);
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString()}`, 14, 40);

    doc.setFont("helvetica", "bold");
    doc.text(`Resumen General de Turnos Asistidos:`, 14, 50);
    doc.setFont("helvetica", "normal");
    doc.text(`Turnos UCI Realizados: ${globalUCI}`, 14, 56);
    doc.text(`Turnos UCE Realizados: ${globalUCE}`, 14, 62);
    doc.text(`Total Global Facturable: ${globalTotal} Turnos`, 14, 68);

    let tableBody = [];
    Object.keys(stats).forEach(docName => {
        let row = [
            docName,
            stats[docName].uci.toString(),
            stats[docName].uce.toString(),
            stats[docName].total.toString()
        ];
        tableBody.push(row);
    });

    tableBody.sort((a,b) => b[3] - a[3]); 

    doc.autoTable({
        startY: 75,
        head: [['Médico Titular', 'Turnos UCI', 'Turnos UCE', 'Total']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [46, 204, 113], textColor: [255, 255, 255] },
        styles: { fontSize: 9 }
    });

    const repSafeName = `Reporte_${this.currentMonthKey.replace(' ', '')}.pdf`;
    doc.save(repSafeName);
  }
};
