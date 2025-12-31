# pip install requests beautifulsoup4 pymongo urllib3
import requests
from bs4 import BeautifulSoup
import json
import time
import random
import re
import os
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from pymongo import MongoClient

# --- CONFIGURATION ---
MONGO_URI = "mongodb+srv://erp:erp@cluster0.arjlve7.mongodb.net/telegram"
BASE_URL = "https://www.5movierulz.hockey"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Referer": BASE_URL,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}

# Setup MongoDB Client
client = MongoClient(MONGO_URI)
db = client['telegram']
collection = db['movies']

def get_robust_session():
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=2, 
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(HEADERS)
    return session

def get_last_processed_page():
    """Queries MongoDB to find the highest page_source processed."""
    last_entry = collection.find_one(sort=[("page_source", -1)])
    if last_entry:
        return last_entry.get("page_source", 1)
    return 1

def run_movierulz_scraper(total_pages=20):
    start_page = get_last_processed_page()
    print(f"🔄 Resuming from MongoDB Page: {start_page}")

    session = get_robust_session()

    for page_num in range(start_page, total_pages + 1):
        url = f"{BASE_URL}/movies/page/{page_num}"
        print(f"\n🌍 [PAGE {page_num}] Connecting to MovieRulz...")

        try:
            time.sleep(random.uniform(2.0, 4.0))
            response = session.get(url, timeout=25)
            if response.status_code != 200:
                print(f"⚠️ Status {response.status_code}. Skipping.")
                continue
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # --- PERSISTENT SELECTOR STRATEGY ---
            movie_items = soup.select('li.cont_display')
            
            if not movie_items:
                main_content = soup.find('div', class_='content')
                if main_content:
                    movie_items = main_content.find_all('li')
            
            if not movie_items:
                movie_items = soup.select('#main li')

            # --- FOOTER FILTER ---
            final_list = []
            for item in movie_items:
                parent_classes = [c for p in item.parents for c in p.get('class', [])]
                if 'recent-movies' in parent_classes or 'sidebar' in parent_classes:
                    continue
                final_list.append(item)

            print(f"🔍 Found {len(final_list)} movies in main grid.")

            for item in final_list:
                link_tag = item.find('a')
                if not link_tag: continue
                
                detail_url = link_tag['href']
                title = link_tag.get('title') or link_tag.text.strip()
                
                if not title:
                    img = link_tag.find('img')
                    title = img.get('alt') if img else "Unknown Title"

                print(f"\n🎬 Processing: {title[:50]}...")
                
                try:
                    time.sleep(random.uniform(1.5, 3.0))
                    detail_res = session.get(detail_url, timeout=20)
                    detail_soup = BeautifulSoup(detail_res.text, 'html.parser')

                    magnet_tags = detail_soup.select('a[href^="magnet:"]')
                    found_magnets = 0
                    
                    for m_tag in magnet_tags:
                        magnet = m_tag['href']
                        size_text = m_tag.get_text(strip=True).upper() or m_tag.parent.get_text(strip=True).upper()

                        # Filter: Size < 2.0GB
                        size_match = re.search(r'([0-9.]+)\s*GB', size_text)
                        if size_match:
                            if float(size_match.group(1)) > 2.0:
                                continue 
                        
                        entry = {
                            "movie_title": title,
                            "quality_info": size_text.replace("\n", " "),
                            "magnet": magnet,
                            "page_source": page_num,
                            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
                        }

                        # Check for duplicates in MongoDB before inserting
                        if not collection.find_one({"magnet": magnet}):
                            collection.insert_one(entry)
                            found_magnets += 1
                    
                    if found_magnets > 0:
                        print(f"   ✅ Stored {found_magnets} links in MongoDB.")
                    else:
                        print(f"   ⏩ No new <2GB links.")

                except Exception as e:
                    print(f"   ❌ Detail Error: {str(e)[:40]}")
                    continue

        except Exception as e:
            print(f"🚨 Page Error: {e}")
            time.sleep(5)
            continue

    print(f"\n🏁 Finished! Data is live in MongoDB Atlas.")

if __name__ == "__main__":
    try:
        run_movierulz_scraper(total_pages=20)
    finally:
        client.close()