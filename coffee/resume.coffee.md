	define (require) ->

dependencies

		annie = require 'annie'
		BubbleGraph = require 'bubblegraph'
		GMaps = require 'GMaps'
		microbox = require 'microbox'
		strftime = require 'strftime'
		umodel = require 'umodel'
		util = require 'util'
		uxhr = require 'uxhr'
		u = require 'u'

resume
======

		class Resume

## options

			options:

{String} your name

				name: 'John Smith'


{Object} how to contact you (supports `email`, `github`, `npm`, and `www`)

				contact: {}


{Element} where to render the resume

				element: document.body


{Array} work history

				history: []


{String} resume objective

				objective: ''


{Array} your skills

				skills: []


{Array} colors for bubbles

				colors: ['0B486B', 'A8DBA8', '79BD9A', '3B8686', 'CFF09E']

{Function} template for the header element

				templateHeader: ->

					_labels =
						email: 'Email'
						github: 'GitHub'
						npm: 'NPM'
						www: 'Web'

					_template = (type, value) ->
						switch type
							when 'email' then "mailto:#{value}"
							when 'github' then "https://github.com/#{value}"
							when 'npm' then "https://npmjs.org/~#{value}"
							when 'www'
								if value.indexOf('http') isnt 0
								then "http://#{value}"
								else value

					contacts = ''

					for key, value of @contact
						contacts += """
							<li><a class="#{key}" href="#{_template key, value}">#{_labels[key]}</a></li>
						"""

					"""
						<header>
							<h1>#{@name}'s Resume</h1>
							<ul>#{contacts}</ul>
						</header>
					"""


{Function} template for the cover (objective and skills)

				templateCover: ->

					skills = '<span class="tag">' + @skills.join('</span><span class="tag">') + '</span>'

					"""
						<div id="cover">
							<h3 id="objective">#{marked @objective}</h3>
							<div id="skills">#{skills}</div>
						</div>
					"""


{Function} template for work history (right sidebar)

				templateHistory: ->

					"""
						<div id="details" class="hide">
							#{@content}
						</div>
					"""


{Function} template for each work history item

				templateHistoryItem: ->

if end of date range is undefined, assume the project is ongoing and use today's date

					if @when[1] is null

get the current date and month as a string (eg. "2013-11")
	
						date = new Date()
						@when[1] = "#{date.getFullYear()}-#{date.getMonth()}"

format dates

					from = strftime '%B %Y', util.strtotime @when[0]
					to = strftime '%B %Y', util.strtotime @when[1]

format location

					if @location
						location = (if @location.city then "#{@location.city}," else '') + ' ' + (@location.state or '')
					else
						location = ''

format responsibilities

					responsibilities = '- ' + @responsibilities.join '\n- '

format skills

					skills = '<span class="tag">' + @skills.join('</span><span class="tag">') + '</span>'
					
explicitly define data (use an array rather than an object to guarantee order)

					data = [
						{ field: 'company', value: "**#{@company}**" }
						{ field: 'title', value: @title }
						{ field: 'location', value: location }
						{ field: 'when', value: "#{from} - #{to}" }
						{ field: 'description', value: @description }
						{ field: 'responsibilities', value: responsibilities }
						{ field: 'skills', value: skills }
					]

format other fields

					fields = ''
					for item in data
						fields += "<dt>#{item.field}</dt><dd>#{marked item.value}</dd>" if item.value?

screenshots

					if @images

						images = '<dt>Screenshots</dt><dd><ul class="images">'

						for image, n in @images

							url = "data/images/#{image}"

							images += """
								<li><a href="#{url}" rel="lightbox[#{@company}]"><img src="#{url}" alt="#{@company} screenshot" /></a></li>
							"""

						images += '</ul></dd>'

					else

						images = ''

google map

					if @location

						map = """
							<span class="map-placeholder">
								Loading<br />
								map...
								<span class="spinner"></span>
							</span>
						"""

					else

						map = ''

return compiled

					"""
						<section class="detail hide">
							#{map}
							<dl>
								#{ fields }
								#{ images }
							</dl>
						</section>
					"""

simple model

			model: new umodel
				graph: null

## constructor
						
			constructor: (options) ->

				util.log 'loaded!'

set options

				_.extend @options, options

attach DOM events

				do @attachEvents

set page title

				document.title = "#{@options.name}'s Resume"

render it!
				
				do @render

append CSS rules for properly sizing the bubbles when they're moved out of the way (aka. when they are clicked) to the stylesheet

				do @resize

				util.log 'rendered!'

## attachEvents

			attachEvents: ->

				document.addEventListener 'click', (e) => @clickBody e
				window.addEventListener 'resize', => @resize
				window.addEventListener 'deviceorientation', => @resize

## clickBody

			clickBody: (event) ->

				element = event.target
				isCircle = @isCircle element
				isDetails = @getDetails element
				isClickMeText = @isClickMeText element
				isLightbox = @isLightbox element
				graph = @model.get 'graph'

				if isLightbox
					return false

				if not isCircle and not isDetails and not isClickMeText and graph

					do graph.deactivate

scale up `<svg>`

					u.classList.remove (document.querySelector 'svg'), 'small'

## isLightbox

			isLightbox: (element) ->

				while element isnt document

					return true if u.classList.contains element, 'microbox'

					element = element.parentNode

## isCircle

			isCircle: (element) ->

				element.tagName is 'circle'

## isDetails

			isDetails: (element) ->

				element.id is 'details'

## isClickMeText
			
			isClickMeText: (element) ->

				element.id is 'clickme'

## getDetails

			getDetails: (element) ->

				while element isnt document

					return element if @isDetails element

					element = element.parentNode

## render
we queue up rendering-related tasks like this for a number of reasons:

- it provides a clean interface to add/remove tasks
- it keeps rendering tasks independent of one another
- iteration reduces code redundancy
- deferring prevents the UI from locking up between iterations
- it's a readable way to organize the code

			render: ->

				queue = [
					{ fn: 'renderHistory', log: 'rendered history!' }
					{ fn: 'clearSpinner' }
					{ fn: 'renderMaps', log: 'rendered maps!' }
					{ fn: 'renderBubbles', log: 'rendered bubbles!' }
					{ fn: 'initLightboxes', log: 'initialized lightboxes' }
					{ fn: 'getRepoCount', log: 'rendered repo counts!' }
				]

				_.each queue, (item) =>
					_.defer _.bind @[item.fn], @
					util.log item.log if item.log

## clearSpinner

			clearSpinner: ->

				spinner = document.querySelector '#loading'

				u.classList.add spinner, 'fade-out'

			initLightboxes: ->

				do microbox.init

## renderHistory

			renderHistory: ->

				html = htmlDetails = ''

render header (title, contact information)

				html += @options.templateHeader.call @options

render objective, skills

				html += @options.templateCover.call @options

render history details (what shows up when user clicks on bubbles)

				for item in @options.history
					htmlDetails += @options.templateHistoryItem.call item

				html += @options.templateHistory.call
					content: htmlDetails

				@options.element.innerHTML = html

## renderBubbles

			renderBubbles: ->

				graph = new BubbleGraph
					colors: @options.colors
					data: @options.history
					element: @options.element

				@model.set 'graph', graph

				
## renderMaps

			renderMaps: ->

compute details pane width

				details = document.querySelector '#details'

show the pane for a sec to give it a measurable `offsetWidth`

				u.classList.remove details, 'hide'
				width = details.offsetWidth - 20 # 20 is the padding
				u.classList.add details, 'hide'

				placeholders = details.querySelectorAll '.map-placeholder'

fetch map images from google using `GMaps`

				_.each @options.history, (item, n) =>

					location = item.location

					if location

						address = "#{location.address or ''} #{location.city or ''} #{location.state or ''}"
						src = GMaps.staticMapURL
							address: address
							markers: [
								{
									color: @options.colors[n%@options.colors.length]
									address: address
								}
							]
							size: [width, 150]
							zoom: 9

create an `<img>` for map

						img = document.createElement 'img'
						img.alt = ''
						img.className = 'map'
						img.src = src

ie10 likes it like this :/

						img.width = width

wait for the image to finish loading, then render it nicely

						img.onload = ->

fade placeholder out

							u.classList.add placeholders[n], 'fade-out'

remove placeholder, inject map `<img>`

							setTimeout ->

remove, inject

								placeholders[n].parentNode.replaceChild img, placeholders[n]

force render before fading the map in

								_.defer ->
									u.classList.add img, 'fade-in'

							, 200

## templateRepoCounts

			templateRepoCounts: (counts) ->

				for platform, count of (JSON.parse counts) when typeof count is 'number'
					for element in document.querySelectorAll ".#{platform}"
						element.innerHTML += " (#{count})"

## getRepoCount
show a repository count in the DOM

			getRepoCount: ->

				uxhr 'http://www.contributor.io/api', @options.contact,
					success: @templateRepoCounts

## resize
`window.resize` handler, also fired onLoad

			resize: ->

				scale = .7
				rotate = -60
				x = -28
				y = -27
				bin = Math.floor @options.element.offsetHeight/100

				if bin < 5
					scale = (bin+1)/10
					rotate = -60 + 20*(5 - bin)

define CSS rule for bubble group when it's activated and moved out of the way
				
				property = 'transform'
				value = "scale(#{scale}) translate3d(#{x}%, #{y}%, 0) rotate(#{rotate}deg);"
				rule =
					"""
						svg.small {
							-#{ do annie.vendor.toLowerCase }-#{ property }: #{ value }
							#{ property }: #{value}
						}
					"""

Append to the DOM. See http://stackoverflow.com/a/707794/435124 for how CSS rule insertion works
			
				sheet = document.styleSheets[0]
				sheet.insertRule rule, sheet.cssRules.length