function initModel() {
	var sUrl = "/SiteCockpitSrv/odata/v2/scService/";
	var oModel = new sap.ui.model.odata.ODataModel(sUrl, true);
	sap.ui.getCore().setModel(oModel);
}