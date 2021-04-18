sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.Addresses", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "",
				addressID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "addressView");
		},

		onAddressListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("addressList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("addressView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("addressTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query"),
				aFilter = [];

			if (sQuery) {
				aFilter = [new Filter("town", FilterOperator.Contains, sQuery)];
			}

			this.byId("addressList").getBinding("items").filter(aFilter, "Application");

		},

		onRefresh: function () {
			this.byId("addressList").getBinding("items").refresh();
		},

		onAddAddress: function (oEvent) {
			this.getRouter().getTargets().display("CreateAddress", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditAddress: function (oEvent) {
			var oAddressBC = oEvent.getSource().getBindingContext(),
				sAddressID = oAddressBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateAddress", {
				objectId: sAddressID,
				mode: "Edit"
			});
		},

		getCountry: function (oContext) {
			var sCountryCode = oContext.getProperty("country_code"),
				oGroup = {
					key: sCountryCode
				};
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = oGroup.key;
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