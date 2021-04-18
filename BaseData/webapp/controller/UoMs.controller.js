sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/m/MessageBox",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, Filter, Sorter, MessageBox, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.UoMs", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				UoMID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "UoMView");
		},

		onUoMListUpdateFinished: function (oEvent) {
			var oList = this.byId("UoMsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("UoMView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailUoMTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		/*				onAfterRendering: function () {
							var aSorters = [
								new Sorter({
									path: "dimension",
									group: this.getDimension()
								}),
								new Sorter({
									path: "code"
								})
							];
							this.byId("UoMsList").getBinding("items").sort(aSorters, "Application");
						},
		*/
		onRefresh: function () {
			this.byId("UoMsList").getBinding("items").refresh();
		},

		onAddUoM: function (oEvent) {
			this.getRouter().getTargets().display("CreateUoM", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditUoM: function (oEvent) {
			var oUoMBC = oEvent.getSource().getBindingContext(),
				sUoMID = oUoMBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateUoM", {
				objectId: sUoMID,
				mode: "Edit"
			});
		},

		getDimension: function (oContext) {
			var oGroup = {
				key: String(oContext.getProperty("dimension"))
			};
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = this.getResourceBundle().getText("dimension") + " " + oGroup.key;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});