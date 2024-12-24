import os
import discord
from discord.ext import commands
import requests
import json
import asyncio
from urllib.parse import urlparse
import re
from yt_dlp import YoutubeDL

class KenkuFMRemoteControl:
    def __init__(self, host="localhost", port=3333):
        self.base_url = f"http://{host}:{port}/api/remote-control"
        
    def get_windows(self):
        """Get all available windows and their views"""
        response = requests.get(f"{self.base_url}/windows")
        return response.json()
    
    def load_url(self, window_id, view_id, url):
        """Load a URL in a specific browser view"""
        payload = {
            "actions": [
                {
                    "type": "loadURL",
                    "viewId": view_id,
                    "url": url
                }
            ]
        }
        response = requests.post(
            f"{self.base_url}/windows/{window_id}/execute",
            json=payload
        )
        return response.json()

class MusicQueue:
    def __init__(self):
        self.queue = []  # Will store tuples of (url, duration)
        self.current = None
        self.is_playing = False
        self.ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'force_generic_extractor': False
        }
        
    def get_video_info(self, query):
        """Get video info from URL or search query"""
        try:
            # Configure yt-dlp options
            search_opts = {
                'quiet': True,
                'extract_flat': True,
                'force_generic_extractor': False,
                'default_search': 'ytsearch',  # Enable YouTube search
                'no_warnings': True,
                'format': 'best'
            }

            with YoutubeDL(search_opts) as ydl:
                # If it's not a URL, treat as search
                if not self.is_url(query):
                    # Perform search and get first result
                    info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                    if 'entries' in info:
                        # Get first search result
                        info = info['entries'][0]
                else:
                    # Direct URL extraction
                    info = ydl.extract_info(query, download=False)

                duration = info.get('duration', 0)
                title = info.get('title', 'Unknown Title')
                url = info.get('webpage_url', info.get('url', None))  # Get the actual video URL
                
                return url, duration, title
        except Exception as e:
            print(f"Error getting video info: {str(e)}")
            return None, None, None

    def is_url(self, string):
        """Check if string is a URL"""
        try:
            result = urlparse(string)
            return all([result.scheme, result.netloc])
        except:
            return False
            
    def format_duration(self, duration):
        """Format duration in seconds to MM:SS"""
        # Convert duration to integer seconds
        total_seconds = int(float(duration))
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:02d}"

class KenkuBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix='!', intents=intents)
        
        self.remote = KenkuFMRemoteControl()
        self.queues = {}  # Dictionary to store queues for different guilds
        self.window_id = None
        self.view_id = None
        
        # Initialize connection to Kenku FM
        self.initialize_kenku_connection()
        
    def initialize_kenku_connection(self):
        """Initialize connection to Kenku FM and get window/view IDs"""
        try:
            windows = self.remote.get_windows()
            if not windows.get('windows'):
                raise Exception("No Kenku FM windows found!")
                
            window = windows['windows'][0]
            self.window_id = window['id']
            # Get existing view or use ID 1 for new view
            self.view_id = window['views'][0]['id'] if window.get('views') else 1
            
            print(f"Connected to Kenku FM - Window ID: {self.window_id}, View ID: {self.view_id}")
        except Exception as e:
            print(f"Failed to initialize Kenku FM connection: {str(e)}")
            raise e

    async def setup_hook(self):
        """Set up bot commands"""
        @self.command(name='p')
        async def p(ctx, *, query: str):
            """Add a YouTube video to the queue by URL or search term"""
            guild_id = ctx.guild.id
            if guild_id not in self.queues:
                self.queues[guild_id] = MusicQueue()
                
            queue = self.queues[guild_id]
            
            # Show searching message for non-URLs
            searching_msg = None
            if not queue.is_url(query):
                searching_msg = await ctx.send(f"🔍 Searching for: {query}")

            url, duration, title = queue.get_video_info(query)
            
            # Delete searching message if it exists
            if searching_msg:
                await searching_msg.delete()
            
            if None in (url, duration, title):
                await ctx.send("❌ Error finding video. Please try again.")
                return
                
            queue.queue.append((url, duration, title))
            duration_str = queue.format_duration(duration)
            
            # Different messages for search vs direct URL
            if not queue.is_url(query):
                await ctx.send(f"✅ Found and added to queue: {title} [{duration_str}] ({url})")
            else:
                await ctx.send(f"✅ Added to queue: {title} [{duration_str}] ({url})")
            
            if not queue.is_playing:
                await self.play_next(guild_id)

        @self.command(name='skip')
        async def skip(ctx):
            """Skip the current video"""
            guild_id = ctx.guild.id
            if guild_id in self.queues:
                await self.play_next(guild_id)
                await ctx.send("Skipped to next video")
            else:
                await ctx.send("No queue exists!")

        @self.command(name='queue')
        async def show_queue(ctx):
            """Show the current queue"""
            guild_id = ctx.guild.id
            if guild_id not in self.queues:
                await ctx.send("Queue is empty!")
                return
                
            queue = self.queues[guild_id]
            if not queue.queue:
                await ctx.send("Queue is empty!")
                return
                
            # Create formatted queue list with titles and durations
            queue_list = []
            for i, (url, duration, title) in enumerate(queue.queue):
                duration_str = queue.format_duration(duration)
                queue_list.append(f"{i+1}. {title} [{duration_str}]")
            
            queue_text = "\n".join(queue_list)
            
            # Add currently playing if exists
            if queue.current:
                current_url, current_duration, current_title = queue.current
                current_duration_str = queue.format_duration(current_duration)
                queue_text = f"Now Playing: {current_title} [{current_duration_str}]\n\nQueue:\n{queue_text}"
            
            await ctx.send(queue_text)

        @self.command(name='clear')
        async def clear_queue(ctx):
            """Clear the queue"""
            guild_id = ctx.guild.id
            if guild_id in self.queues:
                self.queues[guild_id] = MusicQueue()
                await ctx.send("Queue cleared!")
            else:
                await ctx.send("No queue exists!")

    def format_duration(self, duration):
        """Format duration in seconds to MM:SS"""
        # Convert duration to integer seconds
        total_seconds = int(float(duration))
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes}:{seconds:02d}"

    async def play_next(self, guild_id):
        """Play the next video in the queue"""
        if guild_id not in self.queues:
            return
            
        queue = self.queues[guild_id]
        if not queue.queue:
            queue.is_playing = False
            queue.current = None
            return
            
        # Get next video from queue
        next_url, duration, title = queue.queue.pop(0)
        queue.current = (next_url, duration, title)
        queue.is_playing = True
        
        try:
            # Load the URL in Kenku FM
            self.remote.load_url(self.window_id, self.view_id, next_url)
            
            # Convert duration to string for logging
            duration_str = queue.format_duration(duration)
            print(f"Playing: {title} [{duration_str}]")
            
            # Wait for video duration plus a small buffer
            await asyncio.sleep(float(duration) + 2)  # Add 2 seconds buffer for loading
            await self.play_next(guild_id)
        except Exception as e:
            print(f"Error playing video: {str(e)}")
            await self.play_next(guild_id)

def main():
    # Load your Discord bot token from environment variable or config file
    TOKEN = os.getenv("DISCORD_TOKEN")
    
    bot = KenkuBot()
    try:
        bot.run(TOKEN)
    except Exception as e:
        print(f"Failed to start bot: {str(e)}")

if __name__ == "__main__":
    main()