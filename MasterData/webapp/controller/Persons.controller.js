sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.Persons", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "",
				personID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "personView");
		},

		onPersonListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("personList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("personView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("personTableHeadingCount", [iTotalItems]);
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
				aFilters = [];

			if (sQuery) {
				aFilters = [new Filter("lastName", FilterOperator.Contains, sQuery)];
			}

			this.byId("personList").getBinding("items").filter(aFilters, "Application");

		},

		onRefresh: function () {
			this.byId("personList").getBinding("items").refresh();
		},

		onAddPerson: function (oEvent) {
			this.getRouter().getTargets().display("CreatePerson", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditPerson: function (oEvent) {
			var oPersonBC = oEvent.getSource().getBindingContext(),
				sPersonID = oPersonBC.getProperty("ID");

			this.getRouter().getTargets().display("CreatePerson", {
				objectId: sPersonID,
				mode: "Edit"
			});
		},

		getCompany: function (oContext) {
			var oCompany = oContext.getProperty("company"),
				oGroup;

			if (oCompany) {
				oGroup = {
					key: oCompany.companyName
				};
			} else {
				oGroup = {
					key: undefined
				};
			}
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