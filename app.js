(() => {
    // ----- UI -----
    const timeEl = document.getElementById("time");
    const phaseLabelEl = document.getElementById("phaseLabel");
    const detailEl = document.getElementById("detail");
    const phasePanel = document.getElementById("phasePanel");
    const statusHud = document.getElementById("statusHud");
    const roundHud = document.getElementById("roundHud");
    const stationHud = document.getElementById("stationHud");

    const startBtn = document.getElementById("startBtn");
    const pauseBtn = document.getElementById("pauseBtn");
    const resetBtn = document.getElementById("resetBtn");
    const fullscreenBtn = document.getElementById("fullscreenBtn");

    // Inputs
    const stationsTotalEl = document.getElementById("stationsTotal");
    const roundsTotalEl = document.getElementById("roundsTotal");
    const trainSecEl = document.getElementById("trainSec");
    const swapSecEl = document.getElementById("swapSec");
    const restSecEl = document.getElementById("restSec");

    const last5BeepsEl = document.getElementById("last5Beeps");
    const phaseBeepsEl = document.getElementById("phaseBeeps");
    const goBeepsEl = document.getElementById("goBeeps");
    const voiceEl = document.getElementById("voice");

    // ----- Layout helper (Settings weg + Timer größer im Laufbetrieb) -----
    function setRunningLayout(isRunning) {
        document.body.classList.toggle("is-running", isRunning);
    }

    // ----- Audio -----
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    function beep(freq = 440, duration = 0.09, gain = 0.07) {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = gain;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + duration);
    }
    function beepPattern(pattern) {
        // pattern: Array<{f,d,g,t}>
        // t = delay ms from now
        ensureAudio();
        if (audioCtx.state === "suspended") audioCtx.resume();
        const now = audioCtx.currentTime;

        pattern.forEach((p) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = "sine";
            o.frequency.value = p.f;
            g.gain.value = p.g;
            o.connect(g);
            g.connect(audioCtx.destination);

            const startAt = now + (p.t / 1000);
            const stopAt = startAt + p.d;

            o.start(startAt);
            o.stop(stopAt);
        });
    }

    function speak(text) {
        if (!voiceEl.checked) return;
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "de-DE";
        u.rate = 1.0;
        window.speechSynthesis.speak(u);
    }

    // ----- State -----
    let timerId = null;
    let running = false;

    // phase: "training" | "swap" | "rest" | "done"
    let phase = "training";
    let prevPhase = null;

    let round = 1;
    let station = 1; // 1..stationsTotal
    let remaining = 60;

    function clampInt(v, min, max) {
        const n = Math.max(min, Math.min(max, parseInt(v, 10) || min));
        return n;
    }

    function readConfig() {
        const STATIONS = clampInt(stationsTotalEl.value, 2, 20);
        const ROUNDS = clampInt(roundsTotalEl.value, 1, 10);
        const TRAIN = clampInt(trainSecEl.value, 10, 600);
        const SWAP = clampInt(swapSecEl.value, 5, 180);
        const REST = clampInt(restSecEl.value, 0, 600);

        // sanitize
        stationsTotalEl.value = STATIONS;
        roundsTotalEl.value = ROUNDS;
        trainSecEl.value = TRAIN;
        swapSecEl.value = SWAP;
        restSecEl.value = REST;

        return { STATIONS, ROUNDS, TRAIN, SWAP, REST };
    }

    function lockSettings(lock) {
        [stationsTotalEl, roundsTotalEl, trainSecEl, swapSecEl, restSecEl].forEach((el) => {
            el.disabled = lock;
        });
    }

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }

    function updateHud() {
        const cfg = readConfig();
        roundHud.textContent = `${round} / ${cfg.ROUNDS}`;
        stationHud.textContent = `${station} / ${cfg.STATIONS}`;
    }

    function setPhaseUI() {
        phasePanel.classList.remove("phase-training", "phase-swap", "phase-rest");

        if (phase === "training") {
            phasePanel.classList.add("phase-training");
            phaseLabelEl.textContent = "Training";
            statusHud.textContent = "Läuft";
            detailEl.innerHTML = `Arbeiten an allen Stationen (parallel).`;
        } else if (phase === "swap") {
            phasePanel.classList.add("phase-swap");
            phaseLabelEl.textContent = "Wechsel";
            statusHud.textContent = "Wechsel";
            detailEl.innerHTML = `Wechsel zur nächsten Station.`;
        } else if (phase === "rest") {
            phasePanel.classList.add("phase-rest");
            phaseLabelEl.textContent = "Pause";
            statusHud.textContent = "Pause";
            detailEl.innerHTML = `Pause nach Durchgang.`;
        } else if (phase === "done") {
            phaseLabelEl.textContent = "Fertig";
            statusHud.textContent = "Fertig";
            detailEl.innerHTML = `Workout abgeschlossen.`;
        } else {
            phaseLabelEl.textContent = "Bereit";
            statusHud.textContent = "Bereit";
            detailEl.innerHTML = `Drücke <strong>Start</strong>.`;
        }

        updateHud();
    }

    function tickUI() {
        timeEl.textContent = formatTime(remaining);
        const isLast5 = remaining <= 5 && remaining >= 1;
        timeEl.classList.toggle("last5", isLast5);
    }

    function phaseStartCue() {
        // Standard-Phasenton (Training/Wechsel/Pause)
        if (!phaseBeepsEl.checked && !voiceEl.checked) return;

        ensureAudio();
        if (audioCtx.state === "suspended") audioCtx.resume();

        if (phaseBeepsEl.checked) {
            if (phase === "training") beep(660, 0.10, 0.09);
            if (phase === "swap") beep(520, 0.10, 0.09);
            if (phase === "rest") beep(420, 0.12, 0.10);
        }

        if (voiceEl.checked) {
            if (phase === "training") speak("Training.");
            if (phase === "swap") speak("Wechsel.");
            if (phase === "rest") speak("Pause.");
        }
    }

    function goCueIfNeeded() {
        // Zusätzlicher „Weiter geht’s“-Ton: wenn Training nach Wechsel beginnt
        if (!goBeepsEl.checked) return;
        if (prevPhase !== "swap") return; // gezielt nach Wechsel

        // deutlich anderer Ton: kurzer Doppelton (hoch -> höher)
        beepPattern([
            { f: 880, d: 0.09, g: 0.12, t: 0 },
            { f: 1320, d: 0.09, g: 0.12, t: 140 },
        ]);
    }

    function last5Cue() {
        if (!last5BeepsEl.checked) return;
        ensureAudio();
        if (audioCtx.state === "suspended") audioCtx.resume();
        beep(900, 0.09, 0.12);
    }

    function nextPhase() {
        const cfg = readConfig();

        prevPhase = phase;

        if (phase === "training") {
            phase = "swap";
            remaining = cfg.SWAP;
            setPhaseUI();
            phaseStartCue();
            return;
        }

        if (phase === "swap") {
            // Nächste Station
            station++;
            if (station <= cfg.STATIONS) {
                phase = "training";
                remaining = cfg.TRAIN;
                setPhaseUI();
                phaseStartCue();
                goCueIfNeeded(); // <<< zusätzlicher „Weiter geht’s“-Ton
                return;
            }

            // Stationsrunde fertig -> Pause
            phase = "rest";
            remaining = cfg.REST;
            station = cfg.STATIONS; // Anzeige bleibt „letzte Station“, bis Pause endet
            setPhaseUI();
            if (cfg.REST > 0) phaseStartCue();
            if (voiceEl.checked) speak(`Durchgang ${round} beendet.`);
            return;
        }

        if (phase === "rest") {
            round++;
            if (round > cfg.ROUNDS) {
                finish();
                return;
            }
            // Nächster Durchgang
            station = 1;
            phase = "training";
            remaining = cfg.TRAIN;
            setPhaseUI();
            phaseStartCue();
            if (voiceEl.checked) speak(`Durchgang ${round}.`);
            return;
        }
    }

    function finish() {
        stopTimer();
        phase = "done";
        setPhaseUI();
        timeEl.textContent = "00:00";
        timeEl.classList.remove("last5");

        ensureAudio();
        if (audioCtx.state === "suspended") audioCtx.resume();
        // Abschluss-Signal (klar)
        beepPattern([
            { f: 740, d: 0.12, g: 0.11, t: 0 },
            { f: 740, d: 0.12, g: 0.11, t: 170 },
        ]);
        speak("Workout fertig.");
    }

    function runTick() {
        if (!running) return;

        if (remaining <= 5 && remaining >= 1) last5Cue();
        tickUI();

        if (remaining === 0) {
            nextPhase();
            tickUI();
            return;
        }
        remaining--;
    }

    function startTimer() {
        if (running) return;

        ensureAudio();
        if (audioCtx.state === "suspended") audioCtx.resume();

        running = true;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        lockSettings(true);

        // >>> Layout: Settings weg, Timer größer
        setRunningLayout(true);

        const cfg = readConfig();

        if (phase === "done") {
            phase = "training";
            prevPhase = null;
            round = 1;
            station = 1;
            remaining = cfg.TRAIN;
        }

        setPhaseUI();
        phaseStartCue();
        tickUI();

        timerId = setInterval(runTick, 1000);
    }

    function stopTimer() {
        running = false;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        lockSettings(false);

        // >>> Layout zurück (Settings wieder sichtbar)
        setRunningLayout(false);

        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function resetAll() {
        stopTimer();

        const cfg = readConfig();
        phase = "training";
        prevPhase = null;
        round = 1;
        station = 1;
        remaining = cfg.TRAIN;

        statusHud.textContent = "Bereit";
        setPhaseUI();
        phaseLabelEl.textContent = "Bereit";
        detailEl.innerHTML = `Drücke <strong>Start</strong>.`;
        tickUI();

        // >>> sicherstellen, dass Layout im Reset-Zustand normal ist
        setRunningLayout(false);
    }

    function toggleFullscreen() {
        const el = document.documentElement;
        if (!document.fullscreenElement) {
            el.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    // Apply config changes when not running
    [stationsTotalEl, roundsTotalEl, trainSecEl, swapSecEl, restSecEl].forEach((el) => {
        el.addEventListener("change", () => {
            const cfg = readConfig();
            if (!running && phase !== "done") {
                if (phase === "training") remaining = cfg.TRAIN;
                if (phase === "swap") remaining = cfg.SWAP;
                if (phase === "rest") remaining = cfg.REST;
                // station clamp if stations reduced
                if (station > cfg.STATIONS) station = cfg.STATIONS;
                updateHud();
                tickUI();
            }
        });
    });

    // Buttons
    startBtn.addEventListener("click", startTimer);
    pauseBtn.addEventListener("click", stopTimer);
    resetBtn.addEventListener("click", resetAll);
    fullscreenBtn.addEventListener("click", toggleFullscreen);

    // Init
    readConfig();
    resetAll();
})();
