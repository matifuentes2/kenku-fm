import os
import discord
from discord.ext import commands
import requests
import json
import asyncio
from urllib.parse import urlparse
import re

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
        self.queue = []
        self.current = None
        self.is_playing = False

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
        @self.command(name='play')
        async def play(ctx, url: str):
            """Add a YouTube video to the queue"""
            # Validate YouTube URL
            if not self.is_valid_youtube_url(url):
                await ctx.send("Please provide a valid YouTube URL!")
                return
                
            guild_id = ctx.guild.id
            if guild_id not in self.queues:
                self.queues[guild_id] = MusicQueue()
                
            queue = self.queues[guild_id]
            queue.queue.append(url)
            
            await ctx.send(f"Added to queue: {url}")
            
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
                
            queue_list = "\n".join([f"{i+1}. {url}" for i, url in enumerate(queue.queue)])
            await ctx.send(f"Current queue:\n{queue_list}")

        @self.command(name='clear')
        async def clear_queue(ctx):
            """Clear the queue"""
            guild_id = ctx.guild.id
            if guild_id in self.queues:
                self.queues[guild_id] = MusicQueue()
                await ctx.send("Queue cleared!")
            else:
                await ctx.send("No queue exists!")

    def is_valid_youtube_url(self, url):
        """Validate if the URL is a YouTube URL"""
        youtube_regex = r'^(https?://)?(www\.)?(youtube\.com|youtu\.?be)/.+$'
        return bool(re.match(youtube_regex, url))

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
        next_url = queue.queue.pop(0)
        queue.current = next_url
        queue.is_playing = True
        
        try:
            # Load the URL in Kenku FM
            self.remote.load_url(self.window_id, self.view_id, next_url)
            
            # Wait for approximate video duration before playing next
            # You might want to implement a more sophisticated way to detect when videos end
            await asyncio.sleep(300)  # 5 minutes default wait
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