# FrameForge

En första Windows-app för lokal videokonvertering, byggd med Electron och FFmpeg. Svenskt gränssnitt, filkö, tre kvalitetsprofiler, H.264/H.265, MP4, AAC och avbrytning. Originalfiler och befintliga utdatafiler skrivs inte över.

Detta är en tidig version, inte full funktionsparitet med HandBrake. Undertexter, GPU-kodning, videoförhandsvisning, kapitel och avancerat spårval finns ännu inte. FFmpeg körs på CPU. Alla ljudspår inkluderas som AAC. HDR konverteras inte med tonmappning; använd SDR-källor tills HDR-stöd finns.

## Utveckling på Windows

1. Installera Node.js 24 LTS och FFmpeg från en Windows-distribution länkad på https://ffmpeg.org/download.html. Välj en distribution med `libx264` och `libx265`. FFmpeg medföljer inte appen.
2. Kör `npm ci` i projektmappen.
3. Kör `npm start`. Välj `ffmpeg.exe` via **FFmpeg-inställningar** om det inte finns på PATH.
4. Lägg till videor, välj utdatamapp, kvalitetsprofil och kodare. Starta kön.

Filer bearbetas sekventiellt. Avbrutna och misslyckade jobb raderar sin ofullständiga utdatafil. Appen väljer ett ledigt filnamn automatiskt. Kö och utdatamapp sparas inte mellan starter; FFmpeg-sökvägen sparas i användarens appdata.

## Verifiering

`npm test` skapar en kort syntetisk video och verifierar riktig H.264- och H.265-kodning, ljudspår, filskydd och avbrytning med FFmpeg/ffprobe på PATH. `FFMPEG_PATH` och `FFPROBE_PATH` kan ange andra körbara filer för testerna.

## Windows-installationsfil

Kör `npm run dist:win` på Windows. Installationsfilen skapas under `dist/`. Byggkommandot använder `--publish never`: ingen GitHub-release publiceras och ingen `GH_TOKEN` behövs. Actions bifogar installationsfilen som en nedladdningsbar artifact. Den är osignerad tills ett kodsigneringscertifikat konfigureras. En Windows-runner för manuell byggning finns i GitHub Actions. Certifikat och FFmpeg ingår inte i distributionen.

## Säkerhetsmodell

Renderaren saknar Node-åtkomst och kör med isolerad kontext och sandbox. Filåtkomst väljs genom operativsystemets dialoger. FFmpeg startas utan kommandoskal. Inga molntjänster eller API-nycklar krävs.
