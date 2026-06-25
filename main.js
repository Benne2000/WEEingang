/* =====================================================================
 * Werttreiberbaum Filialumsatz  —  SAC Custom Widget
 * Tag: <werttreiberbaum-widget>  |  DataBinding key: myDataSource
 * Vendor: Benne  |  v1.0.0
 *
 * Zerlegt den Netto-Filialumsatz top-down in seine Werttreiber
 *   Umsatz = Bons x Bonwert ;  Bonwert = Artikel/Bon x Stueckpreis
 * vergleicht jede Filiale gegen das Filialnetz (Benchmark),
 * markiert den Engpass-Treiber und schlaegt konkrete Massnahmen vor.
 *
 * Live-Daten kommen aus SAC (this.myDataSource). Ohne Anbindung
 * rendert das Widget mit eingebetteten Demo-Daten, damit es sofort
 * im Designer / standalone funktioniert.
 * ===================================================================== */
(function () {
  "use strict";

  /* ---------- Eingebettete Demo-/Fallback-Daten (aus modell_gesamt) ---------- */
  var EMBEDDED = {"flaeche":{"F01":8200,"F02":5600,"F03":3400},"rows":[{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Baustoffe","pos":"Fachberatung","u":8772.38,"br":10384.02,"rb":1611.61,"art":1078,"bons":18,"ret":0,"tx":18},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Baustoffe","pos":"Kasse","u":2393.1,"br":2844.34,"rb":451.24,"art":297,"bons":5,"ret":0,"tx":5},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Baustoffe","pos":"Teamleitung","u":1376.36,"br":1655.57,"rb":279.22,"art":181,"bons":3,"ret":1,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Baustoffe","pos":"Verkauf","u":2430.3,"br":2862.0,"rb":431.7,"art":297,"bons":5,"ret":1,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Fachberatung","u":5523.24,"br":6501.02,"rb":977.78,"art":251,"bons":6,"ret":0,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":497.51,"br":575.49,"rb":77.99,"art":21,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":4050.05,"br":4570.29,"rb":520.24,"art":169,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":3265.25,"br":3849.73,"rb":584.48,"art":153,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":1050.87,"br":1206.22,"rb":155.33,"art":195,"bons":11,"ret":0,"tx":11},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":1254.34,"br":1439.84,"rb":185.49,"art":223,"bons":6,"ret":0,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":641.95,"br":758.29,"rb":116.34,"art":120,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":907.04,"br":1035.7,"rb":128.66,"art":175,"bons":6,"ret":0,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":2979.62,"br":3446.19,"rb":466.59,"art":110,"bons":11,"ret":0,"tx":11},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Kasse","u":1280.66,"br":1537.24,"rb":256.56,"art":54,"bons":6,"ret":0,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Teamleitung","u":971.82,"br":1093.1,"rb":121.27,"art":37,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":663.93,"br":809.59,"rb":145.67,"art":27,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":1254.36,"br":1454.62,"rb":200.26,"art":58,"bons":6,"ret":0,"tx":6},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Kasse","u":286.22,"br":333.67,"rb":47.44,"art":17,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Teamleitung","u":418.03,"br":478.99,"rb":60.97,"art":21,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Verkauf","u":156.74,"br":195.41,"rb":38.67,"art":7,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":2695.72,"br":3086.72,"rb":391.0,"art":234,"bons":9,"ret":0,"tx":9},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Kasse","u":34.98,"br":43.14,"rb":8.15,"art":4,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Teamleitung","u":180.41,"br":215.95,"rb":35.54,"art":15,"bons":1,"ret":1,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":631.67,"br":725.8,"rb":94.12,"art":62,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":2699.65,"br":3166.7,"rb":467.07,"art":168,"bons":11,"ret":0,"tx":11},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Kasse","u":536.29,"br":657.44,"rb":121.15,"art":35,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":770.5,"br":878.2,"rb":107.7,"art":48,"bons":3,"ret":1,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":1282.69,"br":1468.67,"rb":185.99,"art":79,"bons":5,"ret":0,"tx":5},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":3481.42,"br":4029.12,"rb":547.71,"art":105,"bons":14,"ret":0,"tx":14},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Kasse","u":569.32,"br":663.38,"rb":94.07,"art":19,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Teamleitung","u":652.8,"br":759.97,"rb":107.16,"art":21,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":2284.79,"br":2637.36,"rb":352.58,"art":73,"bons":7,"ret":0,"tx":7},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":2294.28,"br":2610.54,"rb":316.25,"art":51,"bons":8,"ret":0,"tx":8},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Filialleitung","u":161.29,"br":176.35,"rb":15.06,"art":3,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Kasse","u":525.63,"br":621.65,"rb":96.02,"art":12,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":241.48,"br":294.66,"rb":53.17,"art":7,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Verkauf","u":2131.32,"br":2500.73,"rb":369.41,"art":56,"bons":8,"ret":0,"tx":8},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Baustoffe","pos":"Fachberatung","u":2392.93,"br":2408.81,"rb":15.89,"art":255,"bons":12,"ret":0,"tx":12},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Baustoffe","pos":"Kasse","u":1012.17,"br":1034.82,"rb":22.66,"art":103,"bons":5,"ret":0,"tx":5},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Baustoffe","pos":"Teamleitung","u":437.62,"br":442.52,"rb":4.9,"art":45,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Baustoffe","pos":"Verkauf","u":1076.28,"br":1078.12,"rb":1.84,"art":124,"bons":5,"ret":0,"tx":5},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Fachberatung","u":7348.51,"br":7455.75,"rb":107.23,"art":283,"bons":17,"ret":0,"tx":17},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":1370.47,"br":1389.82,"rb":19.35,"art":52,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":1462.18,"br":1482.45,"rb":20.27,"art":52,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":693.0,"br":693.0,"rb":0.0,"art":28,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":734.55,"br":737.33,"rb":2.78,"art":118,"bons":11,"ret":0,"tx":11},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":205.24,"br":208.04,"rb":2.8,"art":32,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":336.06,"br":337.19,"rb":1.13,"art":51,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":563.03,"br":565.07,"rb":2.05,"art":89,"bons":9,"ret":0,"tx":9},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":426.16,"br":426.16,"rb":0.0,"art":15,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Kasse","u":666.2,"br":675.74,"rb":9.54,"art":22,"bons":5,"ret":0,"tx":5},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Teamleitung","u":145.61,"br":152.61,"rb":7.0,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":1037.9,"br":1038.34,"rb":0.43,"art":34,"bons":7,"ret":0,"tx":7},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":1835.78,"br":1849.68,"rb":13.9,"art":79,"bons":15,"ret":0,"tx":15},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Kasse","u":46.3,"br":47.5,"rb":1.2,"art":2,"bons":2,"ret":0,"tx":2},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Teamleitung","u":403.7,"br":404.93,"rb":1.23,"art":16,"bons":4,"ret":0,"tx":4},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Verkauf","u":731.41,"br":743.06,"rb":11.66,"art":33,"bons":9,"ret":0,"tx":9},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":1836.93,"br":1857.1,"rb":20.16,"art":142,"bons":16,"ret":0,"tx":16},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Filialleitung","u":75.91,"br":76.78,"rb":0.87,"art":5,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Kasse","u":316.81,"br":321.54,"rb":4.73,"art":29,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Teamleitung","u":312.92,"br":315.73,"rb":2.8,"art":26,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":840.91,"br":847.82,"rb":6.91,"art":63,"bons":7,"ret":0,"tx":7},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":906.77,"br":912.26,"rb":5.5,"art":45,"bons":7,"ret":0,"tx":7},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Filialleitung","u":99.33,"br":99.33,"rb":0.0,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Kasse","u":329.39,"br":335.63,"rb":6.23,"art":19,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":384.51,"br":388.18,"rb":3.67,"art":21,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":287.15,"br":290.36,"rb":3.21,"art":14,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":1637.15,"br":1650.93,"rb":13.76,"art":43,"bons":11,"ret":1,"tx":12},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Kasse","u":390.12,"br":399.82,"rb":9.7,"art":13,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Teamleitung","u":364.79,"br":369.22,"rb":4.44,"art":11,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":640.67,"br":652.95,"rb":12.3,"art":17,"bons":6,"ret":1,"tx":7},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":1192.94,"br":1214.45,"rb":21.51,"art":26,"bons":10,"ret":0,"tx":10},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Kasse","u":1042.91,"br":1048.87,"rb":5.96,"art":23,"bons":8,"ret":0,"tx":8},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":350.76,"br":357.09,"rb":6.34,"art":7,"bons":3,"ret":0,"tx":3},{"fil":"F01","reg":"Nord","st":"Gewerbegebiet","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Verkauf","u":1673.98,"br":1704.09,"rb":30.11,"art":35,"bons":10,"ret":0,"tx":10},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Baustoffe","pos":"Fachberatung","u":2901.25,"br":3387.63,"rb":486.39,"art":360,"bons":8,"ret":1,"tx":9},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Baustoffe","pos":"Filialleitung","u":433.24,"br":509.91,"rb":76.67,"art":57,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Baustoffe","pos":"Kasse","u":1891.15,"br":2240.16,"rb":349.01,"art":211,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Baustoffe","pos":"Teamleitung","u":834.43,"br":943.6,"rb":109.16,"art":90,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Baustoffe","pos":"Verkauf","u":0.0,"br":0.0,"rb":0.0,"art":0,"bons":0,"ret":1,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Fachberatung","u":2249.6,"br":2625.27,"rb":375.67,"art":113,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":3417.65,"br":3922.41,"rb":504.76,"art":160,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":949.42,"br":1092.2,"rb":142.79,"art":43,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":5833.72,"br":6726.25,"rb":892.53,"art":276,"bons":6,"ret":0,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":947.65,"br":1114.64,"rb":166.95,"art":159,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":148.86,"br":180.59,"rb":31.72,"art":31,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":269.51,"br":302.04,"rb":32.52,"art":44,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":303.98,"br":362.39,"rb":58.42,"art":58,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":1692.84,"br":1990.39,"rb":297.55,"art":69,"bons":6,"ret":0,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Kasse","u":204.69,"br":241.03,"rb":36.33,"art":9,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Teamleitung","u":765.34,"br":884.88,"rb":119.53,"art":29,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":410.97,"br":477.63,"rb":66.66,"art":14,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":846.48,"br":1002.05,"rb":155.57,"art":39,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Kasse","u":435.06,"br":499.51,"rb":64.45,"art":22,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Verkauf","u":321.7,"br":353.44,"rb":31.73,"art":16,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":478.17,"br":566.52,"rb":88.35,"art":44,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Kasse","u":373.71,"br":441.58,"rb":67.87,"art":32,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":719.78,"br":862.51,"rb":142.73,"art":67,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":2454.57,"br":2882.59,"rb":428.02,"art":136,"bons":8,"ret":0,"tx":8},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Kasse","u":483.1,"br":550.27,"rb":67.16,"art":29,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":354.54,"br":408.13,"rb":53.59,"art":20,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":1094.43,"br":1281.22,"rb":186.79,"art":66,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":223.01,"br":277.48,"rb":54.47,"art":9,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Kasse","u":851.19,"br":1002.96,"rb":151.77,"art":29,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Teamleitung","u":636.28,"br":731.81,"rb":95.53,"art":18,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":2147.27,"br":2511.61,"rb":364.37,"art":68,"bons":6,"ret":0,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":2304.87,"br":2593.56,"rb":288.72,"art":56,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Filialleitung","u":270.97,"br":315.27,"rb":44.3,"art":7,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Kasse","u":294.62,"br":352.55,"rb":57.92,"art":8,"bons":2,"ret":0,"tx":2},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":288.72,"br":348.48,"rb":59.75,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Verkauf","u":1201.09,"br":1411.48,"rb":210.39,"art":29,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Baustoffe","pos":"Fachberatung","u":1811.6,"br":1811.6,"rb":0.0,"art":183,"bons":11,"ret":0,"tx":11},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Baustoffe","pos":"Filialleitung","u":177.31,"br":186.79,"rb":9.48,"art":22,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Baustoffe","pos":"Kasse","u":397.88,"br":399.03,"rb":1.14,"art":48,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Baustoffe","pos":"Teamleitung","u":808.69,"br":811.88,"rb":3.18,"art":92,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Baustoffe","pos":"Verkauf","u":1554.02,"br":1565.66,"rb":11.65,"art":179,"bons":10,"ret":1,"tx":11},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Fachberatung","u":5381.56,"br":5479.61,"rb":98.03,"art":203,"bons":16,"ret":1,"tx":17},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Filialleitung","u":161.01,"br":162.21,"rb":1.21,"art":7,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":377.74,"br":386.15,"rb":8.42,"art":16,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":393.51,"br":393.51,"rb":0.0,"art":16,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":3006.28,"br":3046.93,"rb":40.67,"art":109,"bons":12,"ret":2,"tx":14},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":1036.04,"br":1040.93,"rb":4.88,"art":160,"bons":13,"ret":1,"tx":14},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":265.03,"br":267.89,"rb":2.85,"art":47,"bons":5,"ret":1,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":335.89,"br":349.05,"rb":13.15,"art":60,"bons":5,"ret":1,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":550.89,"br":552.24,"rb":1.34,"art":91,"bons":12,"ret":0,"tx":12},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":1806.16,"br":1813.12,"rb":6.98,"art":59,"bons":15,"ret":0,"tx":15},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Kasse","u":335.45,"br":342.52,"rb":7.09,"art":13,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Teamleitung","u":462.56,"br":462.56,"rb":0.0,"art":15,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":576.53,"br":581.56,"rb":5.03,"art":19,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":886.33,"br":905.89,"rb":19.57,"art":39,"bons":10,"ret":1,"tx":11},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Filialleitung","u":23.1,"br":23.5,"rb":0.41,"art":1,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Kasse","u":535.6,"br":545.75,"rb":10.15,"art":25,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Teamleitung","u":368.72,"br":369.39,"rb":0.68,"art":14,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Verkauf","u":490.42,"br":491.5,"rb":1.08,"art":23,"bons":5,"ret":1,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":1568.88,"br":1577.62,"rb":8.74,"art":119,"bons":17,"ret":0,"tx":17},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Filialleitung","u":55.16,"br":58.67,"rb":3.51,"art":4,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Kasse","u":214.3,"br":221.78,"rb":7.48,"art":17,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Teamleitung","u":377.25,"br":382.76,"rb":5.5,"art":31,"bons":6,"ret":0,"tx":6},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":1237.77,"br":1245.64,"rb":7.86,"art":103,"bons":15,"ret":0,"tx":15},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":1215.81,"br":1238.04,"rb":22.23,"art":64,"bons":12,"ret":1,"tx":13},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Kasse","u":491.7,"br":494.2,"rb":2.5,"art":27,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":413.16,"br":413.16,"rb":0.0,"art":21,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":769.15,"br":786.04,"rb":16.86,"art":41,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":2046.78,"br":2066.42,"rb":19.66,"art":52,"bons":18,"ret":0,"tx":18},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Kasse","u":271.19,"br":271.37,"rb":0.19,"art":7,"bons":3,"ret":0,"tx":3},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Teamleitung","u":583.39,"br":598.92,"rb":15.53,"art":16,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":706.64,"br":713.37,"rb":6.73,"art":18,"bons":7,"ret":0,"tx":7},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":2048.39,"br":2084.16,"rb":35.78,"art":41,"bons":17,"ret":0,"tx":17},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Filialleitung","u":137.97,"br":141.0,"rb":3.03,"art":3,"bons":1,"ret":0,"tx":1},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Kasse","u":519.98,"br":527.68,"rb":7.71,"art":11,"bons":5,"ret":0,"tx":5},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":596.58,"br":609.52,"rb":12.93,"art":13,"bons":4,"ret":0,"tx":4},{"fil":"F02","reg":"Mitte","st":"Stadtrand","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Verkauf","u":968.46,"br":987.2,"rb":18.76,"art":21,"bons":9,"ret":2,"tx":11},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Baustoffe","pos":"Fachberatung","u":2985.88,"br":3414.81,"rb":428.93,"art":372,"bons":7,"ret":0,"tx":7},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Baustoffe","pos":"Verkauf","u":1676.01,"br":2002.18,"rb":326.19,"art":198,"bons":3,"ret":0,"tx":3},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":469.16,"br":566.51,"rb":97.35,"art":18,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":1592.47,"br":1874.35,"rb":281.89,"art":69,"bons":3,"ret":1,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":3175.84,"br":3753.24,"rb":577.41,"art":139,"bons":4,"ret":0,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":252.16,"br":289.45,"rb":37.28,"art":44,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":198.81,"br":240.36,"rb":41.56,"art":43,"bons":3,"ret":0,"tx":3},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":246.01,"br":285.55,"rb":39.54,"art":42,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":461.25,"br":532.65,"rb":71.39,"art":85,"bons":5,"ret":0,"tx":5},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":836.14,"br":958.08,"rb":121.94,"art":33,"bons":4,"ret":0,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":134.18,"br":153.8,"rb":19.62,"art":5,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":552.03,"br":645.26,"rb":93.23,"art":30,"bons":3,"ret":0,"tx":3},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Kasse","u":350.61,"br":411.46,"rb":60.85,"art":19,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Farben & Tapeten","pos":"Teamleitung","u":203.19,"br":244.26,"rb":41.06,"art":11,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":334.93,"br":397.27,"rb":62.34,"art":34,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Filialleitung","u":53.46,"br":63.89,"rb":10.43,"art":5,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Teamleitung","u":210.9,"br":240.06,"rb":29.16,"art":17,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":119.11,"br":133.92,"rb":14.82,"art":11,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":111.83,"br":135.39,"rb":23.55,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":178.99,"br":200.29,"rb":21.29,"art":12,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":583.04,"br":672.75,"rb":89.71,"art":36,"bons":3,"ret":0,"tx":3},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":1040.24,"br":1239.83,"rb":199.58,"art":31,"bons":4,"ret":0,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Kasse","u":186.63,"br":232.58,"rb":45.95,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":364.15,"br":408.44,"rb":44.29,"art":12,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":139.69,"br":164.83,"rb":25.14,"art":4,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Grosskunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":523.07,"br":612.73,"rb":89.66,"art":11,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Baustoffe","pos":"Fachberatung","u":2714.11,"br":2754.66,"rb":40.55,"art":282,"bons":18,"ret":1,"tx":19},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Baustoffe","pos":"Filialleitung","u":258.91,"br":258.91,"rb":0.0,"art":25,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Baustoffe","pos":"Kasse","u":532.53,"br":536.33,"rb":3.81,"art":64,"bons":5,"ret":1,"tx":6},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Baustoffe","pos":"Teamleitung","u":972.82,"br":987.53,"rb":14.7,"art":97,"bons":7,"ret":0,"tx":7},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Baustoffe","pos":"Verkauf","u":1919.56,"br":1954.13,"rb":34.56,"art":203,"bons":12,"ret":0,"tx":12},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Fachberatung","u":4471.48,"br":4546.89,"rb":75.42,"art":173,"bons":20,"ret":0,"tx":20},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Filialleitung","u":373.99,"br":373.99,"rb":0.0,"art":15,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Kasse","u":2132.91,"br":2195.47,"rb":62.56,"art":84,"bons":8,"ret":0,"tx":8},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Teamleitung","u":1167.62,"br":1207.67,"rb":40.04,"art":44,"bons":3,"ret":0,"tx":3},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Bodenbelaege & Fliesen","pos":"Verkauf","u":2744.45,"br":2796.8,"rb":52.34,"art":115,"bons":13,"ret":0,"tx":13},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Fachberatung","u":1019.77,"br":1027.97,"rb":8.23,"art":166,"bons":17,"ret":0,"tx":17},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Filialleitung","u":88.29,"br":88.83,"rb":0.54,"art":14,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Kasse","u":238.78,"br":243.23,"rb":4.43,"art":41,"bons":6,"ret":0,"tx":6},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Teamleitung","u":476.47,"br":484.46,"rb":7.99,"art":77,"bons":9,"ret":0,"tx":9},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Eisenwaren & Befestigung","pos":"Verkauf","u":622.23,"br":632.35,"rb":10.11,"art":96,"bons":12,"ret":0,"tx":12},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Fachberatung","u":1114.1,"br":1127.42,"rb":13.33,"art":35,"bons":15,"ret":0,"tx":15},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Filialleitung","u":105.02,"br":105.02,"rb":0.0,"art":4,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Kasse","u":360.05,"br":360.05,"rb":0.0,"art":12,"bons":6,"ret":0,"tx":6},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Teamleitung","u":805.26,"br":817.58,"rb":12.33,"art":28,"bons":8,"ret":0,"tx":8},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Elektro & Leuchten","pos":"Verkauf","u":412.62,"br":415.72,"rb":3.1,"art":15,"bons":8,"ret":0,"tx":8},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Fachberatung","u":1079.55,"br":1093.44,"rb":13.92,"art":44,"bons":15,"ret":1,"tx":16},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Kasse","u":253.58,"br":253.58,"rb":0.0,"art":11,"bons":5,"ret":0,"tx":5},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Teamleitung","u":398.14,"br":411.59,"rb":13.46,"art":18,"bons":7,"ret":0,"tx":7},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Farben & Tapeten","pos":"Verkauf","u":947.44,"br":958.9,"rb":11.47,"art":44,"bons":14,"ret":0,"tx":14},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Fachberatung","u":1268.1,"br":1286.8,"rb":18.69,"art":99,"bons":17,"ret":0,"tx":17},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Filialleitung","u":72.98,"br":72.98,"rb":0.0,"art":6,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Kasse","u":421.62,"br":423.14,"rb":1.51,"art":32,"bons":5,"ret":0,"tx":5},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Teamleitung","u":302.99,"br":307.64,"rb":4.64,"art":24,"bons":5,"ret":0,"tx":5},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Garten & Pflanzen","pos":"Verkauf","u":1141.07,"br":1147.55,"rb":6.48,"art":90,"bons":16,"ret":1,"tx":17},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Fachberatung","u":1348.67,"br":1364.95,"rb":16.29,"art":70,"bons":16,"ret":0,"tx":16},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Kasse","u":502.15,"br":502.7,"rb":0.55,"art":26,"bons":6,"ret":0,"tx":6},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Teamleitung","u":411.11,"br":411.11,"rb":0.0,"art":22,"bons":5,"ret":1,"tx":6},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Holz & Bauelemente","pos":"Verkauf","u":866.46,"br":879.86,"rb":13.4,"art":49,"bons":11,"ret":0,"tx":11},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Fachberatung","u":2640.04,"br":2667.52,"rb":27.48,"art":69,"bons":23,"ret":0,"tx":23},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Filialleitung","u":169.56,"br":169.56,"rb":0.0,"art":4,"bons":1,"ret":0,"tx":1},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Kasse","u":1202.66,"br":1207.5,"rb":4.83,"art":33,"bons":11,"ret":0,"tx":11},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Teamleitung","u":282.13,"br":286.45,"rb":4.32,"art":7,"bons":2,"ret":0,"tx":2},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Sanitaer & Installation","pos":"Verkauf","u":789.45,"br":803.28,"rb":13.8,"art":24,"bons":9,"ret":0,"tx":9},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Fachberatung","u":1935.03,"br":1948.81,"rb":13.77,"art":39,"bons":15,"ret":0,"tx":15},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Kasse","u":376.96,"br":378.82,"rb":1.87,"art":8,"bons":4,"ret":0,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Teamleitung","u":539.67,"br":539.67,"rb":0.0,"art":11,"bons":4,"ret":0,"tx":4},{"fil":"F03","reg":"Sued","st":"Innenstadt","kt":"Privatkunde","wk":"Werkzeuge & Maschinen","pos":"Verkauf","u":1075.73,"br":1084.45,"rb":8.73,"art":24,"bons":9,"ret":1,"tx":10}]};

  /* ---------- Beschriftungen der Drill-Dimensionen ---------- */
  var DIM = {
    wk:  { key: "wk",  label: "Warenkategorie" },
    kt:  { key: "kt",  label: "Kundentyp" },
    pos: { key: "pos", label: "Mitarbeiter-Position" }
  };

  /* ---------- Formatierung ---------- */
  function eur(v)   { return (Math.round(v)).toLocaleString("de-DE") + " \u20AC"; }
  function eur2(v)  { return v.toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) + " \u20AC"; }
  function num(v,d) { return v.toLocaleString("de-DE",{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
  function pct(v,d) { return (v).toLocaleString("de-DE",{minimumFractionDigits:d||1,maximumFractionDigits:d||1}) + " %"; }
  function signPct(v){ var s=v>=0?"+":"\u2212"; return s+Math.abs(v).toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0})+" %"; }

  /* ---------- Aggregation eines Zeilensatzes zu Treibern ---------- */
  function agg(rows) {
    var a = { u:0, br:0, rb:0, art:0, bons:0, ret:0, tx:0 };
    for (var i=0;i<rows.length;i++){ var r=rows[i];
      a.u+=r.u; a.br+=r.br; a.rb+=r.rb; a.art+=r.art; a.bons+=r.bons; a.ret+=r.ret; a.tx+=r.tx; }
    return a;
  }
  function drivers(rows, flaeche) {
    var a = agg(rows);
    return {
      umsatz:   a.u,
      bons:     a.bons,
      artikel:  a.art,
      bonwert:  a.bons ? a.u/a.bons : 0,
      artbon:   a.bons ? a.art/a.bons : 0,
      stueck:   a.art ? a.u/a.art : 0,
      rabq:     a.br ? a.rb/a.br*100 : 0,
      retq:     a.tx ? a.ret/a.tx*100 : 0,
      upqm:     flaeche ? a.u/flaeche : 0,
      _raw:     a
    };
  }

  /* ---------- Treiber-Metadaten: Richtung (hoeher=besser?) ---------- */
  var DRV = {
    bonwert: { label:"Bonwert",        unit:"\u20AC", better:1, fmt:function(v){return eur2(v);} },
    artbon:  { label:"Artikel je Bon", unit:"",       better:1, fmt:function(v){return num(v,1);} },
    stueck:  { label:"\u00D8 St\u00FCckpreis", unit:"\u20AC", better:1, fmt:function(v){return eur2(v);} },
    bons:    { label:"Anzahl Bons",    unit:"",       better:1, fmt:function(v){return num(v,0);} },
    rabq:    { label:"Rabattquote",    unit:"%",      better:-1, fmt:function(v){return pct(v,1);} },
    retq:    { label:"Retourenquote",  unit:"%",      better:-1, fmt:function(v){return pct(v,1);} },
    upqm:    { label:"Umsatz / qm",    unit:"\u20AC", better:1, fmt:function(v){return eur2(v);} }
  };

  /* ---------- Status aus Abweichung ableiten ---------- */
  function status(devPct, better) {
    var d = devPct * (better||1);
    if (d >  5) return "pos";
    if (d < -5) return "neg";
    return "neutral";
  }

  /* =====================================================================
   *  Template (Shadow DOM)
   * ===================================================================== */
  var tmpl = document.createElement("template");
  tmpl.innerHTML =
  '<style>' +
  ':host{all:initial;display:block;width:100%;height:100%;' +
    '--ink:#16202C;--muted:#5C6B7A;--faint:#909DAB;--canvas:#EEF1F5;--surface:#FFFFFF;' +
    '--line:#DCE2E9;--line-2:#EAEEF3;--brand:#0A6E74;--brand-d:#075257;--brand-soft:#E1EFEF;' +
    '--pos:#1F7A47;--pos-soft:#E6F2EB;--neg:#C0392B;--neg-soft:#FAE8E6;--warn:#9C5B00;--warn-soft:#FBEEDB;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
    'color:var(--ink);font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased;}' +
  '*{box-sizing:border-box;}' +
  '.wrap{height:100%;overflow:auto;background:var(--canvas);padding:18px 18px 26px;}' +
  '.tab{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;}' +

  /* header */
  '.hd{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px 22px;margin-bottom:14px;}' +
  '.hd h1{margin:0;font-size:17px;font-weight:700;letter-spacing:-.2px;}' +
  '.hd .sub{margin:2px 0 0;color:var(--muted);font-size:12px;}' +
  '.spacer{flex:1 1 auto;}' +
  '.seg{display:inline-flex;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:3px;gap:2px;}' +
  '.seg button{all:unset;cursor:pointer;padding:5px 11px;border-radius:6px;font-size:12px;font-weight:600;color:var(--muted);line-height:1;}' +
  '.seg button:hover{color:var(--ink);}' +
  '.seg button.on{background:var(--brand);color:#fff;}' +
  '.lbl{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--faint);margin:0 0 5px;display:block;}' +

  /* kpi strip */
  '.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}' +
  '.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:13px 14px;position:relative;overflow:hidden;}' +
  '.kpi .k-lbl{font-size:11px;color:var(--muted);font-weight:600;}' +
  '.kpi .k-val{font-size:22px;font-weight:700;letter-spacing:-.4px;margin-top:3px;}' +
  '.kpi .k-bm{font-size:11px;color:var(--faint);margin-top:1px;}' +
  '.kpi .k-edge{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--line);}' +
  '.kpi.pos .k-edge{background:var(--pos);} .kpi.neg .k-edge{background:var(--neg);} .kpi.neutral .k-edge{background:var(--faint);}' +

  '.pill{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;line-height:1.3;}' +
  '.pill.pos{background:var(--pos-soft);color:var(--pos);} .pill.neg{background:var(--neg-soft);color:var(--neg);} .pill.neutral{background:var(--line-2);color:var(--muted);}' +

  /* card */
  '.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 17px;}' +
  '.card h2{margin:0 0 3px;font-size:13px;font-weight:700;}' +
  '.card .hint{margin:0 0 13px;color:var(--muted);font-size:11.5px;}' +

  /* driver tree */
  '.tree{display:flex;align-items:stretch;gap:0;flex-wrap:wrap;}' +
  '.col{display:flex;flex-direction:column;justify-content:center;gap:12px;}' +
  '.op{display:flex;align-items:center;justify-content:center;width:30px;color:var(--faint);font-size:18px;font-weight:600;flex:0 0 auto;}' +
  '.node{position:relative;background:var(--surface);border:1.5px solid var(--line);border-radius:12px;padding:11px 13px;min-width:138px;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s;}' +
  '.node:hover{border-color:var(--brand);box-shadow:0 4px 14px rgba(10,110,116,.13);transform:translateY(-1px);}' +
  '.node.sel{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft);}' +
  '.node .n-lbl{font-size:11px;color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px;}' +
  '.node .n-val{font-size:19px;font-weight:700;letter-spacing:-.3px;margin-top:2px;}' +
  '.node .n-bm{font-size:10.5px;color:var(--faint);margin-top:1px;}' +
  '.node .n-bar{height:4px;border-radius:3px;background:var(--line-2);margin-top:8px;overflow:hidden;}' +
  '.node .n-bar > i{display:block;height:100%;border-radius:3px;}' +
  '.node.root{border-color:var(--brand-d);background:linear-gradient(180deg,#fff, #f6fbfb);}' +
  '.node.root .n-val{color:var(--brand-d);font-size:21px;}' +
  '.node.eng{border-color:var(--neg);}' +
  '.node.eng:before{content:"Engpass";position:absolute;top:-9px;left:11px;background:var(--neg);color:#fff;font-size:9px;font-weight:800;letter-spacing:.5px;padding:2px 6px;border-radius:5px;text-transform:uppercase;}' +
  '.dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;}' +
  '.dot.pos{background:var(--pos);} .dot.neg{background:var(--neg);} .dot.neutral{background:var(--faint);}' +

  /* two-column lower area */
  '.grid2{display:grid;grid-template-columns:1.05fr 1fr;gap:14px;margin-top:16px;}' +

  /* befund */
  '.finding{display:flex;gap:11px;padding:13px;border-radius:11px;background:var(--brand-soft);border:1px solid #cfe6e6;margin-bottom:14px;}' +
  '.finding .ic{flex:0 0 auto;width:26px;height:26px;border-radius:7px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;}' +
  '.finding p{margin:0;font-size:12.5px;}' +
  '.finding b{color:var(--brand-d);}' +
  '.measure{border:1px solid var(--line);border-radius:11px;padding:12px 13px;margin-bottom:10px;background:#fff;}' +
  '.measure:last-child{margin-bottom:0;}' +
  '.measure .m-top{display:flex;align-items:baseline;gap:8px;}' +
  '.measure .m-no{font-size:11px;font-weight:800;color:var(--brand);background:var(--brand-soft);border-radius:6px;padding:1px 7px;flex:0 0 auto;}' +
  '.measure .m-ttl{font-size:12.5px;font-weight:700;}' +
  '.measure .m-txt{margin:6px 0 0;color:var(--muted);font-size:11.5px;}' +
  '.measure .m-lev{margin-top:7px;font-size:11px;color:var(--ink);}' +
  '.measure .m-lev b{color:var(--brand-d);}' +

  /* drill */
  '.drill-head{display:flex;align-items:center;gap:8px;margin-bottom:11px;flex-wrap:wrap;}' +
  '.drill-head .seg{margin-left:auto;}' +
  '.row{display:grid;grid-template-columns:128px 1fr 88px;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line-2);}' +
  '.row:first-of-type{border-top:none;}' +
  '.row .r-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
  '.row .r-track{height:18px;background:var(--line-2);border-radius:5px;position:relative;overflow:hidden;}' +
  '.row .r-fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:var(--brand);opacity:.85;}' +
  '.row .r-val{font-size:12px;font-weight:700;text-align:right;}' +
  '.row .r-sub{font-size:10.5px;color:var(--faint);font-weight:500;}' +
  '.foot{margin-top:13px;font-size:10.5px;color:var(--faint);}' +
  '.src{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;background:var(--warn-soft);color:var(--warn);font-weight:700;font-size:10px;}' +

  '@media(max-width:820px){.kpis{grid-template-columns:repeat(2,1fr);}.grid2{grid-template-columns:1fr;}}' +
  '</style>' +
  '<div class="wrap" id="root"></div>';

  /* =====================================================================
   *  Custom Element
   * ===================================================================== */
  class WerttreiberBaum extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(tmpl.content.cloneNode(true));
      this._root = this.shadowRoot.getElementById("root");
      this._state = { fil: null, bench: "avg", drill: "wk", driver: "bonwert" };
      this._live = false;
      this._bind();
    }

    /* SAC lifecycle */
    onCustomWidgetAfterUpdate() { this._render(); }
    onCustomWidgetResize() { /* CSS-fluid */ }
    connectedCallback() { this._render(); }

    _bind() {
      this._root.addEventListener("click", (e) => {
        var t = e.target.closest("[data-act]");
        if (!t) return;
        var act = t.getAttribute("data-act"), val = t.getAttribute("data-val");
        if (act === "fil")    this._state.fil = (val === "ALL" ? null : val);
        if (act === "bench")  this._state.bench = val;
        if (act === "drill")  this._state.drill = val;
        if (act === "driver") this._state.driver = val;
        this._render();
      });
    }

    /* ---- Daten beschaffen: SAC live oder eingebettet ---- */
    _data() {
      var ds = this.myDataSource;
      if (ds && ds.state === "success" && ds.data && ds.data.length) {
        var p = this._parseSac(ds);
        if (p && p.rows.length) { this._live = true; return p; }
      }
      this._live = false;
      return { rows: EMBEDDED.rows.slice(), flaeche: EMBEDDED.flaeche };
    }

    _parseSac(ds) {
      try {
        var rows = [], flaeche = {};
        var get = function (cell) { return cell ? (cell.label != null ? cell.label : (cell.id != null ? cell.id : "")) : ""; };
        var raw = function (cell) { return cell && cell.raw != null ? Number(cell.raw) : 0; };
        ds.data.forEach(function (d) {
          var fil = get(d.dimension_filiale) || "?";
          var row = {
            fil: fil,
            reg: get(d.dimension_region) || "",
            st:  get(d.dimension_standorttyp) || "",
            kt:  get(d.dimension_kundentyp) || "n/a",
            wk:  get(d.dimension_warenkategorie) || "n/a",
            pos: get(d.dimension_ma_position) || "n/a",
            u:   raw(d.value_umsatz_netto),
            br:  raw(d.value_umsatz_brutto),
            rb:  raw(d.value_rabatt),
            art: raw(d.value_anzahl_artikel),
            bons:raw(d.value_anzahl_bons),
            ret: 0, tx: raw(d.value_anzahl_bons)
          };
          rows.push(row);
          var fl = raw(d.value_verkaufsflaeche);
          if (fl > 0) flaeche[fil] = fl;
        });
        return { rows: rows, flaeche: flaeche };
      } catch (e) { return null; }
    }

    /* ================================================================= */
    _render() {
      var data = this._data();
      var rows = data.rows, flaeche = data.flaeche;
      var fils = Array.from(new Set(rows.map(function (r) { return r.fil; }))).sort();
      if (!fils.length) { this._root.innerHTML = '<p style="color:#5C6B7A">Keine Daten gebunden.</p>'; return; }
      if (!this._state.fil || fils.indexOf(this._state.fil) < 0) this._state.fil = fils[0];
      var sel = this._state.fil;

      /* Treiber je Filiale + Netz */
      var perFil = {};
      fils.forEach(function (f) {
        perFil[f] = drivers(rows.filter(function (r) { return r.fil === f; }), flaeche[f]);
      });
      var net = drivers(rows, null);
      // Netz-Benchmark je Treiber = Durchschnitt der Filialwerte (oder Bestwert)
      var bench = {};
      Object.keys(DRV).forEach(function (k) {
        var vals = fils.map(function (f) { return perFil[f][k]; });
        if (this._state.bench === "best") {
          bench[k] = DRV[k].better > 0 ? Math.max.apply(null, vals) : Math.min.apply(null, vals);
        } else {
          bench[k] = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
        }
      }.bind(this));

      var D = perFil[sel];
      var dev = function (k) { return bench[k] ? (D[k] / bench[k] - 1) * 100 : 0; };

      /* ---------- HTML zusammensetzen ---------- */
      var H = "";
      H += this._header(fils, sel);
      H += this._kpis(D, dev);
      H += this._treeCard(D, bench, dev);
      H += '<div class="grid2">';
      H +=   this._befundCard(sel, D, bench, dev, perFil, rows, fils);
      H +=   this._drillCard(sel, rows, flaeche, bench);
      H += '</div>';
      H += '<p class="foot">Werttreiber: Umsatz = Bons \u00D7 Bonwert; Bonwert = Artikel/Bon \u00D7 St\u00FCckpreis. ' +
           'Benchmark = ' + (this._state.bench === "best" ? "Bestwert im Filialnetz" : "\u00D8 Filialnetz") + '. ' +
           'Abweichungen > \u00B15 % werden farbig markiert.' +
           (this._live ? '' : '<span class="src">Demo-Daten</span>') + '</p>';

      this._root.innerHTML = H;
    }

    _header(fils, sel) {
      var chips = '<div class="seg">' +
        '<button data-act="fil" data-val="' + sel + '" class="on">' + sel + '</button>';
      var others = fils.filter(function (f) { return f !== sel; });
      others.forEach(function (f) { chips += '<button data-act="fil" data-val="' + f + '">' + f + '</button>'; });
      chips += '</div>';
      var benchSeg = '<div class="seg">' +
        '<button data-act="bench" data-val="avg"' + (this._state.bench==="avg"?' class="on"':'') + '>\u00D8 Netz</button>' +
        '<button data-act="bench" data-val="best"' + (this._state.bench==="best"?' class="on"':'') + '>Bestwert</button>' +
        '</div>';
      return '<div class="hd">' +
        '<div><h1>Werttreiberbaum Filialumsatz</h1>' +
        '<p class="sub">Wo entsteht der Umsatzunterschied \u2013 und was tun? Filiale ' + sel + ' im Vergleich.</p></div>' +
        '<div class="spacer"></div>' +
        '<div><span class="lbl">Filiale</span>' + chips + '</div>' +
        '<div><span class="lbl">Vergleich</span>' + benchSeg + '</div>' +
        '</div>';
    }

    _kpiCard(lbl, valStr, bmStr, devPct, better) {
      var st = status(devPct, better);
      return '<div class="kpi ' + st + '"><span class="k-edge"></span>' +
        '<div class="k-lbl">' + lbl + '</div>' +
        '<div class="k-val tab">' + valStr + '</div>' +
        '<div class="k-bm tab">' + bmStr + ' &middot; <span class="pill ' + st + '">' + signPct(devPct) + '</span></div>' +
        '</div>';
    }
    _kpis(D, dev) {
      var H = '<div class="kpis">';
      H += this._kpiCard("Netto-Umsatz", eur(D.umsatz), "\u00D8 " + eur(this._benchVal("umsatzApprox", D)), this._umsatzDev(D), 1);
      H += this._kpiCard("Umsatz je qm", D.upqm?eur2(D.upqm):"\u2013", "\u00D8 " + eur2(this._netAvg("upqm")), dev("upqm"), 1);
      H += this._kpiCard("Rabattquote", pct(D.rabq,1), "\u00D8 " + pct(this._netAvg("rabq"),1), dev("rabq"), -1);
      H += this._kpiCard("Retourenquote", D._raw.tx?pct(D.retq,1):"\u2013", "\u00D8 " + pct(this._netAvg("retq"),1), dev("retq"), -1);
      H += '</div>';
      return H;
    }

    /* Werttreiber-Baum */
    _treeCard(D, bench, dev) {
      var self = this;
      function node(key, opts) {
        opts = opts || {};
        var d = dev(key), st = status(d, DRV[key].better);
        var w = Math.max(6, Math.min(100, 50 + d * (DRV[key].better) * 1.1));
        var col = st==="pos"?"var(--pos)":st==="neg"?"var(--neg)":"var(--faint)";
        var cls = "node" + (self._state.driver===key?" sel":"") + (opts.root?" root":"") + (opts.eng?" eng":"");
        var bm = opts.root ? "" : '<div class="n-bm tab">\u00D8 ' + DRV[key].fmt(bench[key]) + ' &middot; ' + signPct(d) + '</div>';
        var bar = opts.root ? "" : '<div class="n-bar"><i style="width:'+w+'%;background:'+col+'"></i></div>';
        var dot = opts.root ? "" : '<span class="dot ' + st + '"></span>';
        return '<div class="' + cls + '" data-act="driver" data-val="' + key + '">' +
          '<div class="n-lbl">' + dot + (opts.lbl||DRV[key].label) + '</div>' +
          '<div class="n-val tab">' + opts.valStr + '</div>' + bm + bar + '</div>';
      }
      var rootNode =
        '<div class="node root" data-act="driver" data-val="bonwert">' +
        '<div class="n-lbl">Netto-Umsatz</div>' +
        '<div class="n-val tab">' + eur(D.umsatz) + '</div>' +
        '<div class="n-bm tab">' + num(D.bons,0) + ' Bons \u00D7 ' + eur2(D.bonwert) + '</div></div>';

      // Engpass bestimmen (multiplikative Faktoren Bons/ArtBon/Stueck)
      var eng = this._bottleneck(dev);

      var H = '<div class="card"><h2>Werttreiber-Zerlegung</h2>' +
        '<p class="hint">Klicken Sie einen Treiber an, um ihn unten nach Dimension aufzuschl\u00FCsseln.</p>' +
        '<div class="tree">' +
        '<div class="col">' + rootNode + '</div>' +
        '<div class="op">=</div>' +
        '<div class="col">' + node("bons",{ valStr:num(D.bons,0), eng:eng==="bons" }) + '</div>' +
        '<div class="op">\u00D7</div>' +
        '<div class="col">' +
            node("bonwert",{ valStr:eur2(D.bonwert), eng:eng==="bonwert" }) +
        '</div>' +
        '<div class="op">\u21B3</div>' +
        '<div class="col">' +
            node("artbon",{ valStr:num(D.artbon,1), eng:eng==="artbon" }) +
            node("stueck",{ valStr:eur2(D.stueck), eng:eng==="stueck" }) +
        '</div>' +
        '</div></div>';
      return H;
    }

    /* ---- Hilfen Benchmark/Netz ---- */
    _allFilDrivers() {
      var data = this._data(), rows = data.rows;
      var fils = Array.from(new Set(rows.map(function (r){return r.fil;})));
      var m = {};
      fils.forEach(function (f){ m[f] = drivers(rows.filter(function(r){return r.fil===f;}), data.flaeche[f]); });
      return m;
    }
    _netAvg(k) {
      var m = this._allFilDrivers(), ks = Object.keys(m);
      return ks.reduce(function (a,f){ return a + m[f][k]; }, 0) / ks.length;
    }
    _benchVal() { var m=this._allFilDrivers(),ks=Object.keys(m); return ks.reduce(function(a,f){return a+m[f].umsatz;},0)/ks.length; }
    _umsatzDev(D){ var avg=this._benchVal(); return avg?(D.umsatz/avg-1)*100:0; }

    /* ---- Engpass-Treiber: groesster negativer multiplikativer Beitrag ---- */
    _bottleneck(dev) {
      var cand = ["bons","artbon","stueck"];
      var worst=null, wv=Infinity;
      cand.forEach(function (k){
        var d = dev(k); // better=+1 fuer alle drei
        if (d < wv) { wv = d; worst = k; }
      });
      // Engpass nur markieren, wenn wirklich Rueckstand
      if (wv < -5) {
        // wenn artbon der Engpass ist, faellt das auch auf bonwert -> zeige spezifischer
        return worst;
      }
      return null;
    }

    /* ================= BEFUND + MASSNAHMEN ================= */
    _befundCard(sel, D, bench, dev, perFil, rows, fils) {
      var eng = this._bottleneck(dev);
      var uDev = this._umsatzDev(D);

      /* Kontext: Kundenmix & schwaechste Warenkategorie der Filiale */
      var ctx = this._context(sel, rows, fils);

      /* Befundtext */
      var lead;
      if (eng) {
        lead = 'Filiale <b>' + sel + '</b> liegt mit <b>' + eur(D.umsatz) + '</b> Netto-Umsatz ' +
          (uDev<0? ('<b>'+signPct(uDev)+'</b> unter') : ('<b>'+signPct(uDev)+'</b> \u00FCber') ) +
          ' dem ' + (this._state.bench==="best"?"Bestwert":"Filialnetz-\u00D8") + '. ' +
          'Haupthebel ist <b>' + DRV[eng].label + '</b> (' + DRV[eng].fmt(D[eng]) +
          ' vs. \u00D8 ' + DRV[eng].fmt(bench[eng]) + ', ' + signPct(dev(eng)) + ').';
      } else if (uDev >= 0) {
        lead = 'Filiale <b>' + sel + '</b> liegt mit <b>' + eur(D.umsatz) + '</b> <b>' + signPct(uDev) +
          '</b> \u00FCber dem Vergleich \u2013 kein struktureller Engpass in der Mengen-/Preiskette. ' +
          'Fokus auf Absicherung der St\u00E4rken und Margenqualit\u00E4t.';
      } else {
        lead = 'Filiale <b>' + sel + '</b> liegt <b>' + signPct(uDev) + '</b> unter Vergleich; ' +
          'die Treiber sind ausgeglichen \u2013 Ansatzpunkte eher in Marge (Rabatt) und Retouren.';
      }

      var find = '<div class="finding"><div class="ic">i</div><p>' + lead + '</p></div>';

      /* Massnahmen nach Engpass + Sekundaerflags */
      var ms = this._measures(eng, dev, D, bench, ctx);
      var mhtml = "";
      ms.forEach(function (m, i) {
        mhtml += '<div class="measure"><div class="m-top"><span class="m-no">M' + (i+1) + '</span>' +
          '<span class="m-ttl">' + m.t + '</span></div>' +
          '<p class="m-txt">' + m.d + '</p>' +
          '<div class="m-lev">Hebel: <b>' + m.l + '</b></div></div>';
      });

      return '<div class="card"><h2>Befund &amp; Ma\u00DFnahmen</h2>' +
        '<p class="hint">Automatisch abgeleitet aus der Treiber-Abweichung der Filiale.</p>' +
        find + mhtml + '</div>';
    }

    _context(sel, rows, fils) {
      // Kundenmix-Anteil Grosskunde (Filiale vs Netz)
      function shareGK(rs){ var g=0,t=0; rs.forEach(function(r){ t+=r.u; if(r.kt&&r.kt.indexOf("Gross")===0) g+=r.u; }); return t?g/t*100:0; }
      var filRows = rows.filter(function(r){return r.fil===sel;});
      var gkFil = shareGK(filRows), gkNet = shareGK(rows);

      // schwaechste Warenkategorie: groesster Anteils-Rueckstand vs Netz
      function shareByWk(rs){ var m={},t=0; rs.forEach(function(r){ m[r.wk]=(m[r.wk]||0)+r.u; t+=r.u; }); Object.keys(m).forEach(function(k){m[k]=t?m[k]/t*100:0;}); return m; }
      var sF=shareByWk(filRows), sN=shareByWk(rows), worstWk=null, worstGap=0;
      Object.keys(sN).forEach(function(k){ var gap=(sF[k]||0)-sN[k]; if(gap<worstGap){worstGap=gap;worstWk=k;} });

      // Position mit hoechstem Bonwert (Netz) -> Personal-/Schulungshebel
      function bwByPos(rs){ var u={},b={}; rs.forEach(function(r){ u[r.pos]=(u[r.pos]||0)+r.u; b[r.pos]=(b[r.pos]||0)+r.bons; });
        var best=null,bv=0; Object.keys(u).forEach(function(p){ var v=b[p]?u[p]/b[p]:0; if(v>bv){bv=v;best=p;} }); return {pos:best,bonwert:bv}; }
      var topPos = bwByPos(rows);

      return { gkFil:gkFil, gkNet:gkNet, worstWk:worstWk, worstGap:worstGap, topPos:topPos };
    }

    _measures(eng, dev, D, bench, ctx) {
      var out = [];
      var gkLow = ctx.gkFil < ctx.gkNet - 4;

      if (eng === "artbon") {
        out.push({ t:"Cross- & Up-Selling am Bon steigern",
          d:"Nur "+num(D.artbon,1)+" Artikel je Bon (\u00D8 "+num(bench.artbon,1)+"). Zubeh\u00F6r-Bundles, Komplement"+
            "produkte und Kassenplatzierung (Befestigung zu Holz, Werkzeug zu Baustoffen) erh\u00F6hen die Korbgr\u00F6\u00DFe.",
          l:"+1 Artikel/Bon \u2248 "+signPct(100/Math.max(1,D.artbon))+" Bonwert" });
        if (gkLow) out.push({ t:"Gro\u00DFkundengesch\u00E4ft ausbauen",
          d:"Gro\u00DFkunden tragen hier nur "+pct(ctx.gkFil,0)+" des Umsatzes (Netz "+pct(ctx.gkNet,0)+
            "). B2B kauft gr\u00F6\u00DFere K\u00F6rbe \u2013 Handwerker-/Gewerbeansprache, Projektberatung und Rahmenvertr\u00E4ge gezielt forcieren.",
          l:"gr\u00F6\u00DFere K\u00F6rbe \u2192 Artikel/Bon & Bonwert" });
        out.push({ t:"Fachberatung auf der Fl\u00E4che st\u00E4rken",
          d:"Position \u201E"+(ctx.topPos.pos||"Fachberatung")+"\u201C erzielt netzweit den h\u00F6chsten Bonwert ("+eur2(ctx.topPos.bonwert)+"). "+
            "Beratungsdichte zu Sto\u00DFzeiten und abgeschlossene Schulungen erh\u00F6hen.",
          l:"Beratung \u2192 mehr Artikel/Bon" });
      } else if (eng === "stueck") {
        out.push({ t:"Sortiments- und Preismix anheben",
          d:"\u00D8 St\u00FCckpreis "+eur2(D.stueck)+" liegt unter \u00D8 "+eur2(bench.stueck)+
            ". H\u00F6herwertige Linien und Markenprodukte platzieren, Einstiegsartikel nicht \u00FCberbetonen.",
          l:"Mix \u2192 St\u00FCckpreis \u2192 Bonwert" });
        if (ctx.worstWk) out.push({ t:"Sortimentsl\u00FCcke schlie\u00DFen: "+ctx.worstWk,
          d:"\u201E"+ctx.worstWk+"\u201C ist hier "+signPct(ctx.worstGap)+" unter dem Netz-Umsatzanteil \u2013 Regalfl\u00E4che, Verf\u00FCgbarkeit und Zweitplatzierung pr\u00FCfen.",
          l:"Kategorie-Mix \u2192 Umsatz" });
      } else if (eng === "bons") {
        out.push({ t:"Frequenz & Bonzahl erh\u00F6hen",
          d:"Mit "+num(D.bons,0)+" Bons liegt die Filiale unter \u00D8 "+num(bench.bons,0)+
            ". Lokale Aktionen, schwache Wochentage gezielt bewerben, \u00D6ffnungszeiten/Personalbesetzung an Sto\u00DFzeiten ausrichten.",
          l:"mehr Transaktionen \u2192 Umsatz" });
        out.push({ t:"Conversion am POS verbessern",
          d:"Wartezeiten an der Kasse senken, Self-Checkout f\u00FCr Kleink\u00E4ufe, Click&Collect-Abholung pr\u00FCfen.",
          l:"weniger Abbr\u00FCche \u2192 mehr Bons" });
      } else {
        out.push({ t:"St\u00E4rken absichern",
          d:"Die Mengen-/Preiskette ist intakt. Erfolgsmuster dieser Filiale (Sortiment, Beratung, Mix) als Blaupause f\u00FCr schw\u00E4chere Standorte dokumentieren.",
          l:"Best-Practice-Transfer" });
      }

      /* Sekundaer: Marge & Retouren immer pruefen */
      if (dev("rabq") > 8) out.push({ t:"Rabattvergabe steuern",
        d:"Rabattquote "+pct(D.rabq,1)+" liegt \u00FCber \u00D8 "+pct(bench.rabq,1)+
          ". Freigabegrenzen, Mindestmargen und Konditionsregeln sch\u00FCtzen den Netto-Umsatz, ohne Volumen zu verlieren.",
        l:"Marge \u2192 Netto-Umsatz" });
      if (D._raw.tx && dev("retq") > 12) out.push({ t:"Retouren reduzieren",
        d:"Retourenquote "+pct(D.retq,1)+" \u00FCber \u00D8 "+pct(bench.retq,1)+
          ". Beratungsqualit\u00E4t, korrekte Produktauszeichnung und Mengenpr\u00FCfung bei Gro\u00DFk\u00E4ufen adressieren.",
        l:"weniger R\u00FCckgaben \u2192 Netto-Umsatz" });

      return out.slice(0, 4);
    }

    /* ================= DRILL-DOWN ================= */
    _drillCard(sel, rows, flaeche, bench) {
      var dimKey = this._state.drill;        // wk|kt|pos
      var drvKey = this._state.driver;       // bonwert|artbon|...
      var filRows = rows.filter(function (r){ return r.fil===sel; });

      // gruppiere
      var groups = {};
      filRows.forEach(function (r){ var g=r[dimKey]||"n/a"; (groups[g]=groups[g]||[]).push(r); });
      var items = Object.keys(groups).map(function (g){
        var dr = drivers(groups[g], null);
        return { name:g, dr:dr, val:dr[drvKey], umsatz:dr.umsatz };
      });
      // sort by umsatz desc (Beitrag), Wert je Treiber zeigen
      items.sort(function (a,b){ return b.umsatz - a.umsatz; });
      var maxVal = Math.max.apply(null, items.map(function(i){return Math.abs(i.val)||0;}).concat([1]));

      var dseg = '<div class="seg">';
      ["wk","kt","pos"].forEach(function (k){
        dseg += '<button data-act="drill" data-val="'+k+'"'+(dimKey===k?' class="on"':'')+'>'+DIM[k].label+'</button>';
      });
      dseg += '</div>';

      var drvName = DRV[drvKey] ? DRV[drvKey].label : "Bonwert";
      var rowsHtml = "";
      items.forEach(function (it){
        var w = Math.max(2, Math.abs(it.val)/maxVal*100);
        var vstr = DRV[drvKey] ? DRV[drvKey].fmt(it.val) : eur2(it.val);
        rowsHtml += '<div class="row"><div class="r-name" title="'+it.name+'">'+it.name+'</div>' +
          '<div class="r-track"><div class="r-fill" style="width:'+w+'%"></div></div>' +
          '<div><div class="r-val tab">'+vstr+'</div><div class="r-sub tab">'+eur(it.umsatz)+'</div></div>' +
          '</div>';
      });

      return '<div class="card">' +
        '<div class="drill-head"><h2 style="margin:0">Drill-Down &middot; '+drvName+'</h2>' + dseg + '</div>' +
        '<p class="hint">Filiale '+sel+' nach '+DIM[dimKey].label+', sortiert nach Umsatzbeitrag. Balken = '+drvName+', klein = Umsatz.</p>' +
        rowsHtml + '</div>';
    }
  }

  if (!customElements.get("werttreiberbaum-widget")) {
    customElements.define("werttreiberbaum-widget", WerttreiberBaum);
  }
})();
