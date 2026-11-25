# LOOKin

Steuere deine Infrarotgeräte aus Gladys über eine
[LOOKin Remote2](https://look-in.club) Universalfernbedienung, im lokalen
Netzwerk: Fernseher, Mediaplayer, Lichter, Ventilatoren, Luftreiniger und
Klimaanlagen, die in der LOOKin-App gespeichert sind, dazu Temperatur und
Luftfeuchtigkeit ihres Sensors. Kein Konto, keine Cloud: Gladys spricht direkt
mit der LOOKin, über dein WLAN.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Diese Integration
> wurde mit den vom Projekt aiolookin aufgezeichneten Antworten der lokalen
> LOOKin-API und mit einer simulierten LOOKin gebaut und getestet, nicht mit
> einer echten. Wenn etwas nicht wie beschrieben funktioniert, sag es im
> [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-lookin/issues).

## Was du brauchst

- Gladys Assistant 5.2.0 oder neuer.
- Eine in der **LOOKin-App** eingerichtete LOOKin Remote2 im selben Netzwerk wie
  Gladys.
- Deine Geräte als Fernbedienungen in der LOOKin-App gespeichert (dort werden
  die Infrarotcodes angelernt oder ausgewählt).
- Sonst nichts: kein Konto, kein Schlüssel, kein Internetzugang.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Öffne ihre **Konfiguration**. Nichts ist Pflicht; die Optionen sind:
   - **IP-Adressen der LOOKin Remotes**: nur wenn die automatische Erkennung
     eine nicht findet (anderes Netzwerk, mDNS blockiert). Gib ihr in deinem
     Router eine feste Adresse.
   - **Aktualisierungsintervall**: wie oft jede LOOKin gelesen wird
     (standardmäßig 30 Sekunden).
   - **Sprache der Gerätenamen**: Namen der neuen Geräte und Funktionen.
3. Öffne den Tab **Entdecken**: die LOOKin und jede in der LOOKin-App
   gespeicherte Fernbedienung erscheinen. Füge die gewünschten hinzu.
4. Die Aktion **LOOKin Remotes suchen** der Konfigurationsseite sucht erneut
   und listet die gefundenen auf.

## Die Geräte in Gladys

**Die LOOKin selbst** (Remote2): **Temperatur** und **Luftfeuchtigkeit** ihres
Sensors.

**Ein Gerät pro Fernbedienung**, die in der LOOKin-App gespeichert ist, benannt
wie in der App:

| Fernbedienung                                                | Funktionen                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Fernseher, Medien                                            | **Ein/Aus**, Drucktaster: **Lauter**, Leiser, Stumm, Nächster Sender, Vorheriger Sender, **Quelle**, Menü |
| Licht, Ventilator, Luftbefeuchter, Luftreiniger, Staubsauger | **Ein/Aus** und ein Drucktaster für jede weitere Taste (Stufe, Schwenken, Modus…)                         |
| Klimaanlage (LOOKin-„AC“-Protokoll)                          | **Ein/Aus**, **Modus**, **Solltemperatur** (16 bis 30 °C), **Lüfterstufe**, **Schwenken**                 |

Nur die Tasten, die die Fernbedienung in der LOOKin-App hat, werden angelegt.

- Infrarot funktioniert nur in eine Richtung: Die LOOKin kann das Gerät nicht
  zurücklesen. Der Ein/Aus-Zustand ist der, den sich die LOOKin merkt, aus ihren
  eigenen Befehlen und den Tastendrücken der Originalfernbedienung, die sie
  hört.
- Mit getrennten Tasten „Ein“ und „Aus“ wird jede wie gewünscht gesendet. Mit
  nur einer Ein/Aus-Taste wird sie nur gedrückt, wenn der der LOOKin bekannte
  Zustand abweicht.
- Klimaanlage: Der ganze Zustand wird auf einmal gesendet, wie mit der
  Originalfernbedienung. Die Wahl eines Modus schaltet das Gerät ein;
  Temperatur, Lüfter und Schwenken eines ausgeschalteten Geräts werden für das
  Wiedereinschalten im letzten Modus behalten.

## Dashboard-Widget

Das Widget **LOOKin-Fernbedienung** bringt eine Fernbedienung aufs Dashboard:
ihren Zustand, die von der LOOKin gemessene Raumtemperatur und bis zu vier in
den Einstellungen gewählte Tasten unter denen der Fernbedienung (Ein/Aus,
Lautstärke, Stumm, Sender, Modus, Menü, Stufe, Schwenken; für eine
Klimaanlage: Ein/Aus und Sollwert −1 / +1 °C).

## Szenen

### Aktion: Taste drücken

**Taste einer LOOKin-Fernbedienung drücken** sendet eine Taste einer in der
LOOKin-App gespeicherten Fernbedienung: Ein/Aus (Umschalten), Ein, Aus, Modus
oder Quelle, Stumm, Lautstärke, Sender, Schwenken, Stufe, Cursor, Menü.
Praktisch für Tasten ohne eigene Funktion oder um mehrere Tastendrücke zu
verketten.

### Aktion: IR-Code senden

**IR-Code mit LOOKin senden** sendet einen Roh-Code (Dauern in Mikrosekunden,
`9000 -4500 560 -560 …`) oder einen Pronto-HEX-Code (`0000 006D 0022 0002 …`)
über eine LOOKin, für ein Gerät ohne gespeicherte Fernbedienung. Wähle die
LOOKin oder eine ihrer Fernbedienungen.

### Szenen-Ideen

- Bei Sonnenuntergang den Ventilator aus- und das Licht einschalten.
- Wenn die Temperatur der LOOKin über 27 °C steigt, die Klimaanlage auf Kühlen
  bei 24 °C stellen.
- Beim Verlassen des Hauses den Fernseher ausschalten (Aus-Taste oder
  Umschalten).

Eine fehlgeschlagene Aktion (LOOKin antwortet nicht, Taste fehlt, ungültiger
Code) bricht mit einer roten Meldung ab.

## Fehlerbehebung

- **Keine LOOKin gefunden**: Prüfe, ob sie im selben Netzwerk wie Gladys ist,
  und gib dann ihre IP-Adresse in der Konfiguration ein. Die automatische
  Erkennung nutzt die Netzwerkerkennung von Gladys 5.2 (mDNS und UDP-Port
  61201).
- **Eine Fernbedienung fehlt**: Speichere sie zuerst in der LOOKin-App; sie
  erscheint bei der nächsten Aktualisierung.
- **Der Zustand ist falsch**: Das Gerät wurde mit einer Fernbedienung
  geschaltet, die die LOOKin nicht gehört hat. Mit getrennten Ein- und
  Aus-Tasten sende den Zustand erneut aus Gladys; mit nur einer Ein/Aus-Taste
  schalte das Gerät außer Reichweite der LOOKin, damit beide wieder
  übereinstimmen.

## Grenzen

- Die LOOKin meldet ihre Änderungen per UDP-Broadcast, der den Container der
  Integration nicht erreicht: Deshalb werden sie in jedem
  Aktualisierungsintervall gelesen.
- Kein Anlernen neuer Codes: Lerne oder wähle sie in der LOOKin-App.
- Temperaturen der Klimaanlage in °C, von 16 bis 30, wie das LOOKin-Protokoll.
- Nicht mit LOOKin verbunden.
