> ok this project consists of a monitoring dashboard (deployed on
> node.vives.live)
> The data comes from several office forms exported as CSV's and uploaded to the
> server.
> Now we have to merge all csv layouts to fit the import but it seems to me more
> logical to create different views (tabpages) for every form one. For instance
> one page would be Node TI, other one would be Node AO, other one would be
> Cloud Infrastructure and other one Devops.

Also the admin panel should be adjusted to this tabs views, meaning you you
can first choose the view and then edit the tiles from that view.

In a later upgrade we will automate the import from microsoft office forms
meaning that each time a form is completed the data should automatically be
added to the dashboard in the correct tab page. Maybe this also meand we can
get rid of the CSV files
