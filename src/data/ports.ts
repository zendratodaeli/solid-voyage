/**
 * Major Maritime Ports Seed Data
 * 
 * A curated list of ~150 major maritime ports worldwide with coordinates.
 * Based on UN/LOCODE and NGA World Port Index.
 */

export const majorPorts = [
  // EUROPE - Baltic Sea
  { name: "Rostock", locode: "DERSK", country: "Germany", latitude: 54.0833, longitude: 12.1333, region: "EUROPE" },
  { name: "Hamburg", locode: "DEHAM", country: "Germany", latitude: 53.5511, longitude: 9.9937, region: "EUROPE" },
  { name: "Bremerhaven", locode: "DEBRV", country: "Germany", latitude: 53.5396, longitude: 8.5809, region: "EUROPE" },
  { name: "Gdansk", locode: "PLGDN", country: "Poland", latitude: 54.3520, longitude: 18.6466, region: "EUROPE" },
  { name: "Gdynia", locode: "PLGDY", country: "Poland", latitude: 54.5189, longitude: 18.5305, region: "EUROPE" },
  { name: "Stockholm", locode: "SESTO", country: "Sweden", latitude: 59.3293, longitude: 18.0686, region: "EUROPE" },
  { name: "Gothenburg", locode: "SEGOT", country: "Sweden", latitude: 57.7089, longitude: 11.9746, region: "EUROPE" },
  { name: "Helsinki", locode: "FIHEL", country: "Finland", latitude: 60.1699, longitude: 24.9384, region: "EUROPE" },
  { name: "Tallinn", locode: "EETLL", country: "Estonia", latitude: 59.4370, longitude: 24.7536, region: "EUROPE" },
  { name: "Riga", locode: "LVRIX", country: "Latvia", latitude: 56.9496, longitude: 24.1052, region: "EUROPE" },
  { name: "Klaipeda", locode: "LTKLJ", country: "Lithuania", latitude: 55.7033, longitude: 21.1443, region: "EUROPE" },
  { name: "Copenhagen", locode: "DKCPH", country: "Denmark", latitude: 55.6761, longitude: 12.5683, region: "EUROPE" },
  { name: "St. Petersburg", locode: "RULED", country: "Russia", latitude: 59.9343, longitude: 30.3351, region: "EUROPE" },
  
  // EUROPE - North Sea
  { name: "Rotterdam", locode: "NLRTM", country: "Netherlands", latitude: 51.9244, longitude: 4.4777, region: "EUROPE" },
  { name: "Amsterdam", locode: "NLAMS", country: "Netherlands", latitude: 52.3676, longitude: 4.9041, region: "EUROPE" },
  { name: "Antwerp", locode: "BEANR", country: "Belgium", latitude: 51.2194, longitude: 4.4025, region: "EUROPE" },
  { name: "Zeebrugge", locode: "BEZEE", country: "Belgium", latitude: 51.3334, longitude: 3.1833, region: "EUROPE" },
  { name: "Felixstowe", locode: "GBFXT", country: "United Kingdom", latitude: 51.9539, longitude: 1.3511, region: "EUROPE" },
  { name: "Southampton", locode: "GBSOU", country: "United Kingdom", latitude: 50.9097, longitude: -1.4044, region: "EUROPE" },
  { name: "London Gateway", locode: "GBLGP", country: "United Kingdom", latitude: 51.4484, longitude: 0.4506, region: "EUROPE" },
  { name: "Liverpool", locode: "GBLIV", country: "United Kingdom", latitude: 53.4084, longitude: -2.9916, region: "EUROPE" },
  { name: "Le Havre", locode: "FRLEH", country: "France", latitude: 49.4944, longitude: 0.1079, region: "EUROPE" },
  { name: "Dunkirk", locode: "FRDKK", country: "France", latitude: 51.0343, longitude: 2.3768, region: "EUROPE" },
  
  // EUROPE - Mediterranean
  { name: "Marseille", locode: "FRMRS", country: "France", latitude: 43.2965, longitude: 5.3698, region: "MEDITERRANEAN" },
  { name: "Barcelona", locode: "ESBCN", country: "Spain", latitude: 41.3851, longitude: 2.1734, region: "MEDITERRANEAN" },
  { name: "Valencia", locode: "ESVLC", country: "Spain", latitude: 39.4699, longitude: -0.3763, region: "MEDITERRANEAN" },
  { name: "Algeciras", locode: "ESALG", country: "Spain", latitude: 36.1408, longitude: -5.4536, region: "MEDITERRANEAN" },
  { name: "Genoa", locode: "ITGOA", country: "Italy", latitude: 44.4056, longitude: 8.9463, region: "MEDITERRANEAN" },
  { name: "La Spezia", locode: "ITSPE", country: "Italy", latitude: 44.1024, longitude: 9.8241, region: "MEDITERRANEAN" },
  { name: "Gioia Tauro", locode: "ITGIT", country: "Italy", latitude: 38.4264, longitude: 15.8989, region: "MEDITERRANEAN" },
  { name: "Piraeus", locode: "GRPIR", country: "Greece", latitude: 37.9475, longitude: 23.6372, region: "MEDITERRANEAN" },
  { name: "Thessaloniki", locode: "GRTHE", country: "Greece", latitude: 40.6401, longitude: 22.9444, region: "MEDITERRANEAN" },
  { name: "Istanbul", locode: "TRIST", country: "Turkey", latitude: 41.0082, longitude: 28.9784, region: "MEDITERRANEAN" },
  { name: "Mersin", locode: "TRMER", country: "Turkey", latitude: 36.8000, longitude: 34.6333, region: "MEDITERRANEAN" },
  { name: "Port Said", locode: "EGPSD", country: "Egypt", latitude: 31.2565, longitude: 32.2841, region: "MEDITERRANEAN" },
  { name: "Alexandria", locode: "EGALY", country: "Egypt", latitude: 31.2001, longitude: 29.9187, region: "MEDITERRANEAN" },
  { name: "Tangier Med", locode: "MATNG", country: "Morocco", latitude: 35.8833, longitude: -5.5167, region: "MEDITERRANEAN" },
  { name: "Malta Freeport", locode: "MTMLA", country: "Malta", latitude: 35.8167, longitude: 14.5333, region: "MEDITERRANEAN" },
  
  // MIDDLE EAST
  { name: "Jeddah", locode: "SAJED", country: "Saudi Arabia", latitude: 21.4858, longitude: 39.1925, region: "MIDDLE_EAST" },
  { name: "Dammam", locode: "SADMM", country: "Saudi Arabia", latitude: 26.4367, longitude: 50.1039, region: "MIDDLE_EAST" },
  { name: "Jubail", locode: "SAJUB", country: "Saudi Arabia", latitude: 27.0046, longitude: 49.6628, region: "MIDDLE_EAST" },
  { name: "Ras Tanura", locode: "SARTA", country: "Saudi Arabia", latitude: 26.6442, longitude: 50.1608, region: "MIDDLE_EAST" },
  { name: "Dubai (Jebel Ali)", locode: "AEJEA", country: "UAE", latitude: 25.0145, longitude: 55.0644, region: "MIDDLE_EAST" },
  { name: "Abu Dhabi", locode: "AEAUH", country: "UAE", latitude: 24.4539, longitude: 54.3773, region: "MIDDLE_EAST" },
  { name: "Fujairah", locode: "AEFJR", country: "UAE", latitude: 25.1288, longitude: 56.3265, region: "MIDDLE_EAST" },
  { name: "Salalah", locode: "OMSLL", country: "Oman", latitude: 16.9366, longitude: 54.0031, region: "MIDDLE_EAST" },
  { name: "Sohar", locode: "OMSOH", country: "Oman", latitude: 24.3461, longitude: 56.7334, region: "MIDDLE_EAST" },
  { name: "Kuwait", locode: "KWKWI", country: "Kuwait", latitude: 29.3759, longitude: 47.9774, region: "MIDDLE_EAST" },
  { name: "Bandar Abbas", locode: "IRBND", country: "Iran", latitude: 27.1832, longitude: 56.2666, region: "MIDDLE_EAST" },
  { name: "Bushehr", locode: "IRBUZ", country: "Iran", latitude: 28.9684, longitude: 50.8385, region: "MIDDLE_EAST" },
  { name: "Basra", locode: "IQBSR", country: "Iraq", latitude: 30.5085, longitude: 47.8130, region: "MIDDLE_EAST" },
  { name: "Aqaba", locode: "JOAQJ", country: "Jordan", latitude: 29.5269, longitude: 35.0078, region: "MIDDLE_EAST" },
  
  // ASIA - Indian Subcontinent
  { name: "Mumbai (JNPT)", locode: "INNSA", country: "India", latitude: 18.9500, longitude: 72.9500, region: "INDIAN_SUBCONTINENT" },
  { name: "Chennai", locode: "INMAA", country: "India", latitude: 13.0827, longitude: 80.2707, region: "INDIAN_SUBCONTINENT" },
  { name: "Mundra", locode: "INMUN", country: "India", latitude: 22.8394, longitude: 69.7072, region: "INDIAN_SUBCONTINENT" },
  { name: "Kandla", locode: "INIXY", country: "India", latitude: 23.0333, longitude: 70.2167, region: "INDIAN_SUBCONTINENT" },
  { name: "Kolkata", locode: "INCCU", country: "India", latitude: 22.5726, longitude: 88.3639, region: "INDIAN_SUBCONTINENT" },
  { name: "Visakhapatnam", locode: "INVTZ", country: "India", latitude: 17.6868, longitude: 83.2185, region: "INDIAN_SUBCONTINENT" },
  { name: "Colombo", locode: "LKCMB", country: "Sri Lanka", latitude: 6.9271, longitude: 79.8612, region: "INDIAN_SUBCONTINENT" },
  { name: "Karachi", locode: "PKKHI", country: "Pakistan", latitude: 24.8607, longitude: 67.0011, region: "INDIAN_SUBCONTINENT" },
  { name: "Chittagong", locode: "BDCGP", country: "Bangladesh", latitude: 22.3569, longitude: 91.7832, region: "INDIAN_SUBCONTINENT" },
  
  // ASIA - Southeast Asia
  { name: "Singapore", locode: "SGSIN", country: "Singapore", latitude: 1.2644, longitude: 103.8200, region: "SOUTHEAST_ASIA" },
  { name: "Port Klang", locode: "MYPKG", country: "Malaysia", latitude: 3.0000, longitude: 101.4000, region: "SOUTHEAST_ASIA" },
  { name: "Tanjung Pelepas", locode: "MYTPP", country: "Malaysia", latitude: 1.3625, longitude: 103.5500, region: "SOUTHEAST_ASIA" },
  { name: "Jakarta (Tanjung Priok)", locode: "IDJKT", country: "Indonesia", latitude: -6.1000, longitude: 106.8700, region: "SOUTHEAST_ASIA" },
  { name: "Surabaya", locode: "IDSUB", country: "Indonesia", latitude: -7.2575, longitude: 112.7521, region: "SOUTHEAST_ASIA" },
  { name: "Bangkok (Laem Chabang)", locode: "THLCH", country: "Thailand", latitude: 13.0833, longitude: 100.8833, region: "SOUTHEAST_ASIA" },
  { name: "Ho Chi Minh City", locode: "VNSGN", country: "Vietnam", latitude: 10.8231, longitude: 106.6297, region: "SOUTHEAST_ASIA" },
  { name: "Hai Phong", locode: "VNHPH", country: "Vietnam", latitude: 20.8449, longitude: 106.6881, region: "SOUTHEAST_ASIA" },
  { name: "Manila", locode: "PHMNL", country: "Philippines", latitude: 14.5995, longitude: 120.9842, region: "SOUTHEAST_ASIA" },
  
  // ASIA - East Asia
  { name: "Shanghai", locode: "CNSHA", country: "China", latitude: 31.2304, longitude: 121.4737, region: "EAST_ASIA" },
  { name: "Ningbo-Zhoushan", locode: "CNNGB", country: "China", latitude: 29.8683, longitude: 121.5440, region: "EAST_ASIA" },
  { name: "Shenzhen", locode: "CNSZN", country: "China", latitude: 22.5431, longitude: 114.0579, region: "EAST_ASIA" },
  { name: "Guangzhou", locode: "CNCAN", country: "China", latitude: 23.1291, longitude: 113.2644, region: "EAST_ASIA" },
  { name: "Qingdao", locode: "CNTAO", country: "China", latitude: 36.0671, longitude: 120.3826, region: "EAST_ASIA" },
  { name: "Tianjin", locode: "CNTSN", country: "China", latitude: 39.0842, longitude: 117.2010, region: "EAST_ASIA" },
  { name: "Dalian", locode: "CNDLC", country: "China", latitude: 38.9140, longitude: 121.6147, region: "EAST_ASIA" },
  { name: "Xiamen", locode: "CNXMN", country: "China", latitude: 24.4798, longitude: 118.0894, region: "EAST_ASIA" },
  { name: "Hong Kong", locode: "HKHKG", country: "Hong Kong", latitude: 22.3193, longitude: 114.1694, region: "EAST_ASIA" },
  { name: "Kaohsiung", locode: "TWKHH", country: "Taiwan", latitude: 22.6200, longitude: 120.3100, region: "EAST_ASIA" },
  { name: "Taipei (Keelung)", locode: "TWKEL", country: "Taiwan", latitude: 25.1276, longitude: 121.7392, region: "EAST_ASIA" },
  { name: "Busan", locode: "KRPUS", country: "South Korea", latitude: 35.1796, longitude: 129.0756, region: "EAST_ASIA" },
  { name: "Incheon", locode: "KRINC", country: "South Korea", latitude: 37.4563, longitude: 126.7052, region: "EAST_ASIA" },
  { name: "Tokyo (Yokohama)", locode: "JPYOK", country: "Japan", latitude: 35.4437, longitude: 139.6380, region: "EAST_ASIA" },
  { name: "Kobe", locode: "JPUKB", country: "Japan", latitude: 34.6901, longitude: 135.1956, region: "EAST_ASIA" },
  { name: "Nagoya", locode: "JPNGO", country: "Japan", latitude: 35.0823, longitude: 136.8842, region: "EAST_ASIA" },
  { name: "Osaka", locode: "JPOSA", country: "Japan", latitude: 34.6937, longitude: 135.5023, region: "EAST_ASIA" },
  
  // AFRICA
  { name: "Durban", locode: "ZADUR", country: "South Africa", latitude: -29.8587, longitude: 31.0292, region: "SOUTH_AFRICA" },
  { name: "Cape Town", locode: "ZACPT", country: "South Africa", latitude: -33.9249, longitude: 18.4241, region: "SOUTH_AFRICA" },
  { name: "Richards Bay", locode: "ZARCB", country: "South Africa", latitude: -28.8000, longitude: 32.0833, region: "SOUTH_AFRICA" },
  { name: "Mombasa", locode: "KEMBA", country: "Kenya", latitude: -4.0435, longitude: 39.6682, region: "EAST_AFRICA" },
  { name: "Dar es Salaam", locode: "TZDAR", country: "Tanzania", latitude: -6.8235, longitude: 39.2695, region: "EAST_AFRICA" },
  { name: "Lagos (Apapa)", locode: "NGAPP", country: "Nigeria", latitude: 6.4541, longitude: 3.3841, region: "WEST_AFRICA" },
  { name: "Tema", locode: "GHTEM", country: "Ghana", latitude: 5.6167, longitude: -0.0167, region: "WEST_AFRICA" },
  { name: "Abidjan", locode: "CIABJ", country: "Ivory Coast", latitude: 5.3600, longitude: -4.0083, region: "WEST_AFRICA" },
  { name: "Dakar", locode: "SNDKR", country: "Senegal", latitude: 14.6928, longitude: -17.4467, region: "WEST_AFRICA" },
  { name: "Djibouti", locode: "DJJIB", country: "Djibouti", latitude: 11.5890, longitude: 43.1456, region: "EAST_AFRICA" },
  
  // AMERICAS - North America
  { name: "Los Angeles", locode: "USLAX", country: "United States", latitude: 33.7405, longitude: -118.2720, region: "NORTH_AMERICA" },
  { name: "Long Beach", locode: "USLGB", country: "United States", latitude: 33.7701, longitude: -118.1937, region: "NORTH_AMERICA" },
  { name: "New York (Newark)", locode: "USEWR", country: "United States", latitude: 40.6892, longitude: -74.1745, region: "NORTH_AMERICA" },
  { name: "Savannah", locode: "USSAV", country: "United States", latitude: 32.0809, longitude: -81.0912, region: "NORTH_AMERICA" },
  { name: "Houston", locode: "USHOU", country: "United States", latitude: 29.7604, longitude: -95.3698, region: "NORTH_AMERICA" },
  { name: "Charleston", locode: "USCHS", country: "United States", latitude: 32.7765, longitude: -79.9311, region: "NORTH_AMERICA" },
  { name: "Seattle", locode: "USSEA", country: "United States", latitude: 47.6062, longitude: -122.3321, region: "NORTH_AMERICA" },
  { name: "Oakland", locode: "USOAK", country: "United States", latitude: 37.7955, longitude: -122.2784, region: "NORTH_AMERICA" },
  { name: "Miami", locode: "USMIA", country: "United States", latitude: 25.7617, longitude: -80.1918, region: "NORTH_AMERICA" },
  { name: "New Orleans", locode: "USMSY", country: "United States", latitude: 29.9511, longitude: -90.0715, region: "NORTH_AMERICA" },
  { name: "Vancouver", locode: "CAVAN", country: "Canada", latitude: 49.2827, longitude: -123.1207, region: "NORTH_AMERICA" },
  { name: "Montreal", locode: "CAMTR", country: "Canada", latitude: 45.5017, longitude: -73.5673, region: "NORTH_AMERICA" },
  { name: "Halifax", locode: "CAHAL", country: "Canada", latitude: 44.6488, longitude: -63.5752, region: "NORTH_AMERICA" },
  { name: "Prince Rupert", locode: "CAPRR", country: "Canada", latitude: 54.3150, longitude: -130.3208, region: "NORTH_AMERICA" },
  
  // AMERICAS - Central America & Caribbean
  { name: "Panama (Balboa)", locode: "PABLB", country: "Panama", latitude: 8.9500, longitude: -79.5667, region: "SOUTH_AMERICA" },
  { name: "Panama (Colon)", locode: "PAONX", country: "Panama", latitude: 9.3592, longitude: -79.9008, region: "SOUTH_AMERICA" },
  { name: "Manzanillo", locode: "MXZLO", country: "Mexico", latitude: 19.0522, longitude: -104.3133, region: "NORTH_AMERICA" },
  { name: "Veracruz", locode: "MXVER", country: "Mexico", latitude: 19.1738, longitude: -96.1342, region: "NORTH_AMERICA" },
  { name: "Kingston", locode: "JMKIN", country: "Jamaica", latitude: 17.9714, longitude: -76.7936, region: "SOUTH_AMERICA" },
  { name: "Freeport", locode: "BSFPO", country: "Bahamas", latitude: 26.5333, longitude: -78.7000, region: "NORTH_AMERICA" },
  
  // AMERICAS - South America
  { name: "Santos", locode: "BRSSZ", country: "Brazil", latitude: -23.9608, longitude: -46.3336, region: "SOUTH_AMERICA" },
  { name: "Rio de Janeiro", locode: "BRRIO", country: "Brazil", latitude: -22.9068, longitude: -43.1729, region: "SOUTH_AMERICA" },
  { name: "Paranagua", locode: "BRPNG", country: "Brazil", latitude: -25.5163, longitude: -48.5225, region: "SOUTH_AMERICA" },
  { name: "Buenos Aires", locode: "ARBUE", country: "Argentina", latitude: -34.6037, longitude: -58.3816, region: "SOUTH_AMERICA" },
  { name: "Cartagena", locode: "COCTG", country: "Colombia", latitude: 10.3997, longitude: -75.5144, region: "SOUTH_AMERICA" },
  { name: "Callao", locode: "PECLL", country: "Peru", latitude: -12.0464, longitude: -77.0428, region: "SOUTH_AMERICA" },
  { name: "Valparaiso", locode: "CLVAP", country: "Chile", latitude: -33.0472, longitude: -71.6127, region: "SOUTH_AMERICA" },
  { name: "San Antonio", locode: "CLSAI", country: "Chile", latitude: -33.5934, longitude: -71.6047, region: "SOUTH_AMERICA" },
  { name: "Guayaquil", locode: "ECGYE", country: "Ecuador", latitude: -2.1894, longitude: -79.8891, region: "SOUTH_AMERICA" },
  { name: "Montevideo", locode: "UYMVD", country: "Uruguay", latitude: -34.9011, longitude: -56.1645, region: "SOUTH_AMERICA" },
  
  // OCEANIA
  { name: "Sydney", locode: "AUSYD", country: "Australia", latitude: -33.8688, longitude: 151.2093, region: "AUSTRALIA" },
  { name: "Melbourne", locode: "AUMEL", country: "Australia", latitude: -37.8136, longitude: 144.9631, region: "AUSTRALIA" },
  { name: "Brisbane", locode: "AUBNE", country: "Australia", latitude: -27.4698, longitude: 153.0251, region: "AUSTRALIA" },
  { name: "Fremantle", locode: "AUFRE", country: "Australia", latitude: -32.0569, longitude: 115.7439, region: "AUSTRALIA" },
  { name: "Port Hedland", locode: "AUPHE", country: "Australia", latitude: -20.3106, longitude: 118.6089, region: "AUSTRALIA" },
  { name: "Newcastle", locode: "AUNTL", country: "Australia", latitude: -32.9267, longitude: 151.7789, region: "AUSTRALIA" },
  { name: "Auckland", locode: "NZAKL", country: "New Zealand", latitude: -36.8509, longitude: 174.7645, region: "PACIFIC" },
  { name: "Tauranga", locode: "NZTRG", country: "New Zealand", latitude: -37.6870, longitude: 176.1651, region: "PACIFIC" },
];

export type PortSeedData = typeof majorPorts[number];
